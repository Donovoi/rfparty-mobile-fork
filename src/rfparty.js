//import { point } from 'leaflet'
//import { scan } from 'node-wifi'

const debug = /*(...args)=>{ debug('rfparty', ...args) }*/ require("debug")(
  "rfparty"
);
const Leaflet = require("leaflet");
require("leaflet.markercluster");
require("leaflet.markercluster/dist/MarkerCluster.css");
require("leaflet.markercluster/dist/MarkerCluster.Default.css");
const JSON5 = require("json5");
const Pkg = require("../package.json");
const reach = require("./reach");
const moment = require("moment");
const EventEmitter = require("last-eventemitter");
const EarthDistance = require("earth-distance-js");

const RFPartyDocuments = require("./documents");
const { DistanceEstimator } = require("./distance-estimator");

import * as UUID16_TABLES from "./16bit-uuid-tables.json";
import * as MANUFACTURER_TABLE from "./manufacturer-company-id.json";
const DeviceIdentifiers = require("./device-identifiers");

const JSONViewer = require("json-viewer-js/src/jsonViewer");

const TILE_SERVER_MAPBOX =
  "https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}";
const TILE_SERVER_MAPBOX_CONFIG = {
  attribution: "",
  maxZoom: 24,
  id: "mapbox/dark-v10",
  tileSize: 512,
  zoomOffset: -1,
  accessToken:
    "pk.eyJ1IjoiZGF0YXBhcnR5IiwiYSI6ImNremFnMnlyZjIzZHMycG5mczZ1bDljM2gifQ.uGoEE_YpTbIlELvytTzbNQ",
};

async function delay(ms = 100) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toLoc(location) {
  return {
    lat: location.latitude || 0,
    lon: location.longitude || 0,
  };
}

/**
 * Get marker color based on RSSI signal strength
 * @param {number} rssi - RSSI value in dBm (negative number)
 * @returns {string} Color hex code
 */
function getRssiColor(rssi) {
  if (rssi === undefined || rssi === null) return "#888888"; // gray for unknown
  if (rssi >= -50) return "#00ff00"; // bright green - excellent
  if (rssi >= -60) return "#7fff00"; // chartreuse - very good
  if (rssi >= -70) return "#ffff00"; // yellow - good
  if (rssi >= -80) return "#ffa500"; // orange - fair
  if (rssi >= -90) return "#ff4500"; // orange-red - weak
  return "#ff0000"; // red - very weak
}

/**
 * Get marker radius based on RSSI signal strength
 * Stronger signals = larger markers (closer devices)
 * @param {number} rssi - RSSI value in dBm
 * @returns {number} Marker radius in meters
 */
function getRssiRadius(rssi) {
  if (rssi === undefined || rssi === null) return 8;
  if (rssi >= -50) return 12; // excellent - large
  if (rssi >= -60) return 10; // very good
  if (rssi >= -70) return 8; // good
  if (rssi >= -80) return 7; // fair
  if (rssi >= -90) return 6; // weak
  return 5; // very weak - small
}

/**
 * Generate a small offset based on device address to spread overlapping markers
 * @param {string} address - Device MAC address
 * @param {number} index - Device index in list
 * @returns {{lat: number, lon: number}} Offset to add to position
 */
function getMarkerOffset(address, index) {
  // Use address hash for deterministic but varied offset
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = (hash << 5) - hash + address.charCodeAt(i);
    hash = hash & hash;
  }
  // Create small angular offset based on hash (in degrees, ~10m at equator)
  const angle = (hash % 360) * (Math.PI / 180);
  const distance = 0.00008 + (index % 10) * 0.00003; // ~8-35 meters offset
  return {
    lat: Math.sin(angle) * distance,
    lon: Math.cos(angle) * distance,
  };
}

/**
 * Get display name for a device
 * @param {object} dev - Device station object
 * @returns {string} Best available name for the device
 */
function getDeviceDisplayName(dev) {
  if (dev.data.summary?.localname) return dev.data.summary.localname;
  if (dev.data.summary?.broadcastname) return dev.data.summary.broadcastname;
  if (dev.data.summary?.product) return dev.data.summary.product;
  if (dev.data.summary?.company) return dev.data.summary.company;
  // Shorten MAC address for display
  return dev.data.address.substring(0, 8) + "...";
}

/**
 * Get a short label for a device (for map display)
 * @param {object} dev - Device station object
 * @returns {string} Short label (max ~12 chars)
 */
function getDeviceShortLabel(dev) {
  if (dev.data.summary?.localname) {
    const name = dev.data.summary.localname;
    return name.length > 12 ? name.substring(0, 10) + "…" : name;
  }
  if (dev.data.summary?.broadcastname) {
    const name = dev.data.summary.broadcastname;
    return name.length > 12 ? name.substring(0, 10) + "…" : name;
  }
  if (dev.data.summary?.product) {
    const name = dev.data.summary.product;
    return name.length > 12 ? name.substring(0, 10) + "…" : name;
  }
  // Use last 4 of MAC as identifier
  return dev.data.address.substring(12).replace(/:/g, "");
}

/**
 * Get signal strength category for sorting/display
 * @param {number} rssi - RSSI value
 * @returns {number} Category 0-5 (0=strongest)
 */
function getRssiCategory(rssi) {
  if (rssi === undefined || rssi === null) return 5;
  if (rssi >= -50) return 0;
  if (rssi >= -60) return 1;
  if (rssi >= -70) return 2;
  if (rssi >= -80) return 3;
  if (rssi >= -90) return 4;
  return 5;
}

/**
 *
 * BLE
 *
 * Bool
 *  - connectable [ true / false ]
 *  - address_type [ public / random ]
 * Int
 *  - mtu
 *  - rssi
 *  - duration
 *
 * DateTime or DateTimeRange
 *  - timestamp
 *  - duration
 *
 * String
 *  - localname
 *  - company
 *  - product
 *  - services
 *
 *  Hex String
 *  - address
 *  - companyCode
 *  - appleContinuityTypeCode
 *  -
 */

export class RFParty extends EventEmitter {
  constructor(divId, party = null) {
    super();

    this.party = party;

    this.showAllTracks = true;
    this.showAwayTracks = false;

    this.center = null;
    this.detailsViewer = null;

    // Initialize BLE distance estimator
    this.distanceEstimator = new DistanceEstimator("BLE");

    this.divId = divId;
    this.map = Leaflet.map(divId, {
      attributionControl: false,
      zoomControl: false,
    });

    Leaflet.tileLayer(TILE_SERVER_MAPBOX, TILE_SERVER_MAPBOX_CONFIG).addTo(
      this.map
    );

    let startPoint = [0, 0];

    this.map.setView(startPoint, 3);

    this.positionCircle = Leaflet.circle(startPoint, {
      color: "orange",
      fill: false,
      weight: 1,
      opacity: 0,
    }).addTo(this.map);

    debug("rfparty constructor");

    this.deviceLayers = {};
    this.searchResults = null;
    this.lastRender = null;
    this.lastQuery = null;
    this.lastQueryInput = null;

    this.scanDb = null;

    this.autoCenter = true;
    this.userInteracting = false; // Track if user is manually panning/zooming
    this.lastUserInteraction = null; // Time of last user interaction
    this.autoCenterTimeout = null; // Timer to re-enable auto-center
    this.lastLocation = undefined;
    this.packetCount = 0;
    this.stationCount = 0;
    this.locationCount = 0;

    this.lastmoveTime = null;
    this.sessionStartTime = moment();

    this.queryActive = false;
    this.queryResult = null;
  }

  async indexLocation(location) {
    let movedDistance = !this.lastLocation
      ? 0
      : EarthDistance.haversine(toLoc(this.lastLocation), toLoc(location));

    const latLon = Leaflet.latLng([location.latitude, location.longitude]);
    let hasMoved = movedDistance * 1000 > 100 && location.accuracy < 30;
    let isInView =
      this.map
        .getBounds()
        .pad(-0.3)
        .contains(latLon) && location.accuracy < 30;

    //Update if we don't have a center or accuracy improves and autocenter is turned-on
    // Don't auto-center if user is currently interacting with the map
    const timeSinceInteraction = this.lastUserInteraction
      ? moment().diff(this.lastUserInteraction, "seconds")
      : 999;
    const userRecentlyInteracted = timeSinceInteraction < 30; // 30 seconds grace period

    if (
      !this.center ||
      (this.autoCenter &&
        !this.userInteracting &&
        !userRecentlyInteracted &&
        (this.center.accuracy > location.accuracy || !isInView))
    ) {
      this.center = location;
      debug("update view center");

      if (this.lastmoveTime == null || !this.lastLocation) {
        this.map.flyTo(latLon, 17);
      } else {
        let now = new moment();
        let delta = now.diff(this.lastmoveTime, "seconds");

        debug("\t delta check", delta);

        if (delta > 30) {
          this.map.setView(latLon, 17);
        }
      }

      this.lastLocation = {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
      };

      //Leaflet.circle(latLon, { color: 'white', radius: location.accuracy, fill:false, weight:1, opacity: 0.3 }).addTo(this.map)

      this.positionCircle.setStyle({
        color: "green",
        fill: false,
        weight: 1,
        opacity: 0.9,
      });
    } else {
      this.positionCircle.setStyle({
        color: "orange",
        fill: false,
        weight: 1,
        opacity: 0.9,
      });
    }

    this.positionCircle.setRadius(location.accuracy);
    this.positionCircle.setLatLng(latLon);

    let track = await RFPartyDocuments.geo_track.indexGeoPoint(
      this.party,
      location
    );
    this.locationCount++;
    this.emit("location_count", this.locationCount);
  }

  async indexDevice(dev) {
    if (this.party == null) {
      return;
    }

    // Skip indexing until we have a valid location
    if (
      !this.lastLocation ||
      !this.lastLocation.latitude ||
      !this.lastLocation.longitude
    ) {
      debug("indexDevice - skipping, no location yet");
      return;
    }

    debug("indexDevice -", dev);

    let device = await RFPartyDocuments.ble_adv.indexBleDevice(
      this.party,
      dev,
      this.lastLocation
    );

    // Skip if device had invalid advertising data
    if (!device) {
      debug("indexDevice - skipping device with invalid data");
      return;
    }

    let station = await RFPartyDocuments.ble_station.indexBleStation(
      this.party,
      device
    );

    if (station.data.timebounds.first == station.data.timebounds.last) {
      this.stationCount++;
      this.emit("station_count", this.stationCount);
    }

    this.packetCount++;
    this.emit("packet_count", this.packetCount);
  }

  async start(party) {
    debug("starting");

    this.party = party;

    //await this.handleSearch('duration')

    // Track user interaction start (zoom/pan)
    this.map.on("zoomstart", () => {
      this.userInteracting = true;
      this.lastUserInteraction = moment();
      debug("User started zooming - auto-center paused");
    });

    this.map.on("movestart", () => {
      this.userInteracting = true;
      this.lastUserInteraction = moment();
      debug("User started panning - auto-center paused");
    });

    this.map.on("mousedown", () => {
      this.userInteracting = true;
      this.lastUserInteraction = moment();
    });

    this.map.on("touchstart", () => {
      this.userInteracting = true;
      this.lastUserInteraction = moment();
    });

    this.map.on("mouseup", () => {
      this.lastmoveTime = new moment();
      // Mark interaction end after a short delay
      setTimeout(() => {
        this.userInteracting = false;
      }, 500);
    });

    this.map.on("touchend", () => {
      this.lastmoveTime = new moment();
      setTimeout(() => {
        this.userInteracting = false;
      }, 500);
    });

    this.map.on("zoomend", () => {
      this.lastUserInteraction = moment();
      setTimeout(() => {
        this.userInteracting = false;
      }, 500);
    });

    this.map.on("moveend", () => {
      this.lastUserInteraction = moment();
      setTimeout(() => {
        this.userInteracting = false;
      }, 500);

      if (!this.lastRender) {
        return;
      }
      if (!this.lastQuery) {
        return;
      }

      // Only re-query if significantly different view, not on every small pan
      if (
        (this.lastRender.drawable != this.lastRender.onscreen ||
          this.lastRender.drawable >= 2000) &&
        this.lastQuery !== null
      ) {
        // Debounce the re-query to avoid rapid refreshes
        if (this._moveEndTimeout) {
          clearTimeout(this._moveEndTimeout);
        }
        this._moveEndTimeout = setTimeout(() => {
          this.doQuery(this.lastQuery);
        }, 500);
      }
    });
  }

  async handleSearch(input) {
    debug("handleSearch -", input);

    if (this.queryActive || !this.party) {
      debug("ignoring query. one is already in progress -", input);
      return;
    }

    this.queryActive = true;

    let query = this.party
      .find()
      .type("ble_station")
      .limit(3000);
    let updateStartTime = new moment();

    if (input[0] == "{") {
      debug("raw query");
      const obj = JSON5.parse(input);

      //debug('parsed query', obj)
      //query = obj
    } else {
      try {
        const tokens = input.trim().split(" ");

        let term = tokens.slice(1).join(" ");
        switch (tokens[0].toLowerCase()) {
          case "mac":
          case "address":
            if (tokens.length < 2) {
              query = query.where("address").exists();
            } else {
              query = query.where("address").regex(new RegExp(term, "i")); //TODO - needs $contains support
            }
            break;
          case "here":
            // Zoom to current location (orange circle) first
            if (this.lastLocation) {
              const latLon = Leaflet.latLng([
                this.lastLocation.latitude,
                this.lastLocation.longitude,
              ]);
              this.map.flyTo(latLon, 18);
              // Wait for the map to finish moving before querying
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
            let viewport = this.map.getBounds();
            query = query
              .or()
              .and()
              .where("location.first")
              .exists()
              //.where('location.last').ne(null)
              //.where('location.first').ne(null)
              .where("location.first.lat")
              .exists()
              .where("location.first.lon")
              .exists()
              .where("location.first.lat")
              .lt(viewport.getNorth())
              .where("location.first.lat")
              .gt(viewport.getSouth())
              .where("location.first.lon")
              .lt(viewport.getEast())
              .where("location.first.lon")
              .gt(viewport.getWest())
              .dna()
              .and()
              .where("location.last")
              .exists()
              //.where('location.last').ne(null)
              //.where('location.first').ne(null)
              .where("location.last.lat")
              .exists()
              .where("location.last.lon")
              .exists()
              .where("location.last.lat")
              .lt(viewport.getNorth())
              .where("location.last.lat")
              .gt(viewport.getSouth())
              .where("location.last.lon")
              .lt(viewport.getEast())
              .where("location.last.lon")
              .gt(viewport.getWest());
            break;
          /*case 'nolocation':
            query = {'$or': [
              {'firstlocation': {'$exists': false}},
              {'lastlocation': {'$exists': false}},
              {'firstlocation': null },
              {'lastlocation': null },
            ]}
            break*/
          case "name":
          case "localname":
            debug("select by localname", tokens);
            if (tokens.length < 2) {
              query = query.where("summary.localname").exists();
            } else {
              query = query
                .where("summary.localname")
                .regex(new RegExp(term, "i")); //TODO - needs $contains support
            }

            debug("term[" + term + "]");

            break;
          case "company":
            debug("select by company", tokens);
            if (tokens.length < 2) {
              query = query.where("summary.company").exists();
            } else {
              query = query
                .where("summary.company")
                .regex(new RegExp(term, "i")); //TODO - needs $contains support
            }
            break;

          case "product":
            debug("select by product", tokens);
            if (tokens.length < 2) {
              query = query.where("summary.product").exists();
            } else {
              query = query
                .where("summary.product")
                .regex(new RegExp(term, "i")); //TODO - needs $contains support
            }
            break;

          case "unknown":
          case "unknown-service":
            query = query
              .where("summary.hasUnknownService")
              .exists()
              .where("summary.hasUnknownService")
              .equals(true);
            break;
          case "service":
            const serviceTerm = tokens[1];
            debug("select by service", serviceTerm);

            let specialQuery = null;
            if (tokens.slice(2).length > 0) {
              specialQuery = this.parseServiceSearch(
                query,
                serviceTerm.toLowerCase(),
                tokens.slice(2)
              );
            }

            if (!specialQuery) {
              //let possibleServices = UUIDParser.reverseLookupService(serviceTerm)
              //debug('possible', possibleServices)
              //console.log('possible', possibleServices)

              if (serviceTerm.indexOf("0x") == 0) {
                query = query
                  .or()
                  .where("summary.serviceUuids.known")
                  .regex(new RegExp(serviceTerm.replace("0x", ""), "i"))
                  .where("summary.serviceUuids.unknown")
                  .regex(new RegExp(serviceTerm.replace("0x", ""), "i"));
              } else {
                query = query
                  .where("summary.serviceUuids.results")
                  .regex(new RegExp(serviceTerm, "i"));
              }
            } else {
              query = specialQuery;
            }

            /*query = {
              'services':  {'$containsAny':  possibleServices },
              ...this.parseServiceSearch(serviceTerm.toLowerCase(), tokens.slice(2))
            }*/
            break;

          case "appleip":
          case "appleIp":
            debug("select by appleIp", tokens);
            if (tokens.length < 2) {
              query = query
                .where("summary.appleContinuity.service.airplay.ip")
                .exists();
            } else {
              query = query
                .where("summary.appleContinuity.service.airplay.ip")
                .regex(new RegExp(term, "i"));
            }
            break;

          case "random":
            query = query.where("summary.addressType").equals("random");
            break;
          case "public":
            query = query.where("summary.addressType").equals("public");
            break;
          case "connectable":
            query = query.where("summary.connectable").equals(true);
            break;
          case "duration":
            if (tokens.length < 2) {
              query = query.where("timebounds.duration").gt(30 * 60 * 1000);
            } else {
              query = query
                .where("timebounds.duration")
                .gt(
                  moment.duration("PT" + term.toUpperCase()).as("ms") ||
                    30 * 60000
                );
            }
            break;

          case "error":
            query = query
              .where("summary.appleContinuity.protocolError")
              .exists();
            break;

          default:
            debug("invalid search type", tokens[0]);
            this.emit("search-failed");
            this.queryActive = false;
            return;
        }
      } catch (er) {
        debug("error constructing query");
        this.queryActive = false;
        return;
      }
    }

    if (!query) {
      let updateEndTime = new moment();
      let updateDuration = updateEndTime.diff(updateStartTime);
      this.emit("update-finished", {
        query: this.lastQuery,
        updateDuration,
        render: this.lastRender,
      });

      this.queryActive = false;
      return;
    }

    try {
      this.lastQueryInput = input;
      await this.doQuery(query, updateStartTime);
    } catch (err) {
      debug("query error", err);
    }
    this.queryActive = false;
  }

  async doQuery(query, updateStartTime = new moment()) {
    debug("running query...", query);

    this.emit("search-start", { query });

    let searchStartTime = new moment();

    //const devices = this.db.getCollection('ble').chain().find(query).data()

    const devices =
      this.lastQuery === query ? this.queryResult : await query.exec();

    this.queryResult = devices;

    let searchEndTime = new moment();
    let searchDuration = searchEndTime.diff(searchStartTime);

    this.emit("search-finished", {
      query,
      render: { count: devices.length },
      searchDuration,
    });

    let durations = { searchDuration };

    debug("rendering devices...", devices);
    if (devices != null) {
      this.emit("render-start");
      let renderStartTime = new moment();

      await delay(30);

      await this.renderBleDeviceList(devices);

      let renderEndTime = new moment();
      let renderDuration = renderEndTime.diff(renderStartTime);

      durations.renderDuration = renderDuration;

      this.emit("render-finished", {
        query,
        render: this.lastRender,
        renderDuration,
      });
    }

    let updateEndTime = new moment();
    let updateDuration = updateEndTime.diff(updateStartTime);
    this.emit("update-finished", {
      query,
      render: this.lastRender,
      updateDuration,
      ...durations,
    });

    this.lastQuery = query;
  }

  parseServiceSearch(query, service, terms) {
    if (terms.length == 0) {
      return null;
    }

    switch (service) {
      case "ibeacon":
        query = query.where("summary.appleContinuity.ibeacon.uuid").exists();
        //  .where('summary.appleContinuity.ibeacon.uuid').regex( new RegExp(terms[0], 'i'))
        break;
      case "findmy":
        query = query
          .where("summary.appleContinuity.findmy.maintained")
          .equals(terms[0] == "found");
        break;
      default:
        return null;
    }

    return query;
  }

  async renderBleDeviceList(bleDevices) {
    this.lastRender = {
      count: bleDevices.length,
      onscreen: 0,
      drawable: 0,
    };

    debug("\trendering", bleDevices.length, "ble devices");

    let restrictToBounds = this.restrictToBounds || bleDevices.length > 2000;

    // Use MarkerClusterGroup for grouping nearby beacons
    let clusterGroup = Leaflet.markerClusterGroup({
      maxClusterRadius: 40, // Pixels - beacons within this radius are grouped
      spiderfyOnMaxZoom: true, // Show individual markers when fully zoomed
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 18, // Disable clustering at zoom 18+ to separate beacons
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        // Calculate average RSSI for cluster color
        const markers = cluster.getAllChildMarkers();
        let totalRssi = 0;
        let rssiCount = 0;
        markers.forEach((m) => {
          if (m.options.rssi !== undefined) {
            totalRssi += m.options.rssi;
            rssiCount++;
          }
        });
        const avgRssi = rssiCount > 0 ? totalRssi / rssiCount : -80;
        const clusterColor = getRssiColor(avgRssi);

        // Size based on count
        let size = "small";
        let sizeClass = "marker-cluster-small";
        if (count >= 100) {
          size = "large";
          sizeClass = "marker-cluster-large";
        } else if (count >= 10) {
          size = "medium";
          sizeClass = "marker-cluster-medium";
        }

        return Leaflet.divIcon({
          html: `<div style="background-color: ${clusterColor};"><span>${count}</span></div>`,
          className: `marker-cluster ${sizeClass}`,
          iconSize: Leaflet.point(40, 40),
        });
      },
    });

    let labelsLayer = Leaflet.layerGroup(); // Separate layer for labels (on top)

    // Sort devices by RSSI (weakest first, so strongest render on top)
    const sortedDevices = [...bleDevices].sort((a, b) => {
      const rssiA = a.data.best?.rssi ?? -999;
      const rssiB = b.data.best?.rssi ?? -999;
      return rssiA - rssiB; // Ascending: weak first, strong last (on top)
    });

    let count = 0;
    let strongDeviceCount = 0; // Track how many strong devices we've labeled

    for (let dev of sortedDevices) {
      //if(dev.duration < 30*60000){ continue }

      count++;
      if (count % 500 == 0) {
        await delay(1);
      }

      let lastPt = dev.data.location.last;
      let firstPt = dev.data.location.first;

      if (!lastPt || !firstPt) {
        continue;
      }

      let corner1 = new Leaflet.LatLng(lastPt.lat, lastPt.lon);
      let corner2 = new Leaflet.LatLng(firstPt.lat, firstPt.lon);

      let bounds = new Leaflet.LatLngBounds(corner1, corner2);

      this.lastRender.drawable++;
      if (
        restrictToBounds == true &&
        !this.map.getBounds().intersects(bounds)
      ) {
        continue;
      }

      this.lastRender.onscreen++;

      if (lastPt) {
        // Get RSSI-based styling
        const bestRssi = dev.data.best?.rssi;
        const markerColor = getRssiColor(bestRssi);
        const markerRadius = getRssiRadius(bestRssi);
        const rssiCategory = getRssiCategory(bestRssi);

        // Get display name for tooltip
        const displayName = getDeviceDisplayName(dev);
        const shortLabel = getDeviceShortLabel(dev);
        const rssiText = bestRssi !== undefined ? `${bestRssi} dBm` : "unknown";
        const tooltipContent = `<b>${displayName}</b><br>RSSI: ${rssiText}<br>${dev.data.address}`;

        // Create a circleMarker for clustering (circles don't cluster well)
        let marker = Leaflet.circleMarker([lastPt.lat, lastPt.lon], {
          color: markerColor,
          radius: markerRadius,
          fill: true,
          weight: 2,
          opacity: 1,
          fillOpacity: 0.7,
          fillColor: markerColor,
          rssi: bestRssi, // Store RSSI for cluster color calculation
        });

        // Add tooltip that shows on hover
        marker.bindTooltip(tooltipContent, {
          permanent: false,
          direction: "top",
          className: "beacon-tooltip",
        });

        let onclick = (event) => {
          this.handleClick({
            event,
            type: "ble",
            id: dev.id,
            value: dev.data.address,
            timestamp: dev.data.timebounds.last,
          });
        };

        marker.on("click", onclick);
        clusterGroup.addLayer(marker);

        // Add permanent label for strong/medium signals (top 25)
        if (rssiCategory <= 2 && strongDeviceCount < 25) {
          strongDeviceCount++;
          const labelMarker = Leaflet.marker([lastPt.lat, lastPt.lon], {
            icon: Leaflet.divIcon({
              className: "beacon-label",
              html: `<span class="beacon-label-text" style="background: ${markerColor};">${shortLabel}</span>`,
              iconSize: [80, 20],
              iconAnchor: [40, -8], // Position above the circle
            }),
            interactive: false, // Don't intercept clicks
          });
          labelsLayer.addLayer(labelMarker);
        }
      }
    }

    clusterGroup.addTo(this.map);
    labelsLayer.addTo(this.map); // Add labels layer on top

    if (this.searchResults != null) {
      this.map.removeLayer(this.searchResults);
      delete this.searchResults;
    }
    if (this.labelsResults != null) {
      this.map.removeLayer(this.labelsResults);
      delete this.labelsResults;
    }

    this.searchResults = clusterGroup;
    this.labelsResults = labelsLayer;

    return;
  }

  async getBLEDevice(mac) {
    let adv = await this.party
      .find()
      .type("ble_adv")
      .where("address")
      .equals(mac)
      //.limit(1)
      .exec();

    return adv;
  }

  async updateDeviceInfoHud(station) {
    let devices = Object.keys(this.deviceLayers);
    if (devices.length == 0) {
      window.MainWindow.hideDiv("device-info");
      /*let deviceInfo = document.getElementById('device-info')
      deviceInfo.classList.add('hidden')*/
    } else {
      let devAdv = await this.getBLEDevice(devices[0]);
      let device = devAdv[0];

      debug("updateDeviceInfoHud", device);

      //document.getElementById('device-info-mac').textContent = reach(device, 'address')
      //document.getElementById('device-info-name').textContent = reach(device, 'advertisement.localName')

      let companyText = "";

      if (reach(station, "data.summary.company")) {
        if (!reach(station, "data.summary.companyCode")) {
          companyText = reach(station, "data.summary.company");
        } else {
          companyText =
            reach(station, "data.summary.company") +
            "(" +
            reach(station, "data.summary.companyCode") +
            ")";
        }
      } else if (reach(station, "data.summary.companyCode")) {
        companyText =
          "Unknown Company" +
          "(0x" +
          reach(station, "data.summary.companyCode") +
          ")";
      }

      if (reach(station, "data.summary.product")) {
        if (companyText.length > 0) {
          companyText += "\n";
        }
        companyText += reach(station, "data.summary.product");
      }

      document.getElementById("device-info-address").textContent = reach(
        station,
        "data.address"
      );

      if (reach(station, "data.summary.localname")) {
        document.getElementById("device-info-name").textContent = reach(
          station,
          "data.summary.localname"
        );
        window.MainWindow.showDiv("device-info-name");
      } else {
        window.MainWindow.hideDiv("device-info-name");
      }

      document.getElementById("device-info-company").textContent = companyText;

      document.getElementById(
        "device-info-duration"
      ).textContent = moment
        .duration(station.data.timebounds.duration)
        .humanize();

      // Update RSSI and distance estimation display
      this.updateRssiDisplay(station);

      let serviceText = "";

      if (reach(station, "data.summary.appleContinuity.typeCode")) {
        let appleService = RFParty.lookupAppleService(
          station.data.summary.appleContinuity.typeCode
        );
        if (appleService) {
          serviceText +=
            "Apple " +
            appleService +
            "(0x" +
            station.data.summary.appleContinuity.typeCode +
            "); \n";
        } else {
          serviceText +=
            "Apple " +
            "0x" +
            station.data.summary.appleContinuity.typeCode +
            "; \n";
        }
      }

      if (reach(station, "data.summary.appleContinuity.service.airplay.ip")) {
        serviceText +=
          "Apple IP " +
          station.data.summary.appleContinuity.service.airplay.ip +
          "; \n";
      }

      if (reach(station, "data.summary.serviceUuids")) {
        let uuids = [
          ...new Set([
            ...station.data.summary.serviceUuids.known,
            ...station.data.summary.serviceUuids.unknown,
          ]),
        ];

        uuids.map((uuid) => {
          let name = RFParty.lookupDeviceUuid(uuid);

          if (name) {
            serviceText += name + "(0x" + uuid + "); \n";
          } else {
            serviceText += "0x" + uuid + "; \n";
          }
        });
      }

      document.getElementById("device-info-services").textContent = serviceText;

      let details = document.getElementById("device-info-detailscontainer");

      //details.textContent = JSON.stringify(device.cleanData,null,2)

      while (details.firstChild) {
        details.removeChild(details.firstChild);
      }

      debug("details viewer JSON - ", JSON.stringify(device.cleanData));

      let packets = [];
      let seen = 0;

      for (let adv of devAdv) {
        //adv.parsePacket()
        //console.log(adv.cleanData)
        seen += adv.data.packet.seen;
        if (adv.data.packet.parsed) {
          packets.push(adv.data.packet.parsed);
        }
      }

      const content = {
        packets,
        base64: device.cleanData.packet.base64,
        seen,
      };

      // Store raw JSON for copy function
      this.currentDeviceJson = content;

      this.detailsViewer = new JSONViewer({
        container: details,
        data: JSON.stringify(content),
        theme: "dark",
        expand: false,
      });

      window.MainWindow.showDiv("device-info");
    }
  }

  /**
   * Update the RSSI and estimated distance display in the device info panel
   * @param {object} station - The BLE station document
   */
  updateRssiDisplay(station) {
    const bestRssiEl = document.getElementById("device-info-best-rssi");
    const worstRssiEl = document.getElementById("device-info-worst-rssi");
    const bestDistEl = document.getElementById("device-info-best-distance");
    const worstDistEl = document.getElementById("device-info-worst-distance");
    const confidenceEl = document.getElementById(
      "device-info-distance-confidence"
    );

    // Get RSSI values from station data
    const bestRssi = reach(station, "data.best.rssi");
    const worstRssi = reach(station, "data.worst.rssi");

    // Update best RSSI display
    if (typeof bestRssi === "number") {
      bestRssiEl.textContent = bestRssi;
      bestRssiEl.className =
        "rssi-value " + this.getRssiStrengthClass(bestRssi);

      // Calculate distance from best RSSI (closest approach)
      const bestEstimate = this.distanceEstimator.estimateDistance(
        bestRssi,
        false
      );
      if (bestEstimate.distance !== null) {
        bestDistEl.textContent = `≈${bestEstimate.distance}m`;
      } else {
        bestDistEl.textContent = "";
      }
    } else {
      bestRssiEl.textContent = "--";
      bestRssiEl.className = "rssi-value";
      bestDistEl.textContent = "";
    }

    // Update worst RSSI display
    if (typeof worstRssi === "number") {
      worstRssiEl.textContent = worstRssi;
      worstRssiEl.className =
        "rssi-value " + this.getRssiStrengthClass(worstRssi);

      // Calculate distance from worst RSSI (farthest seen)
      const worstEstimate = this.distanceEstimator.estimateDistance(
        worstRssi,
        false
      );
      if (worstEstimate.distance !== null) {
        worstDistEl.textContent = `≈${worstEstimate.distance}m`;
      } else {
        worstDistEl.textContent = "";
      }
    } else {
      worstRssiEl.textContent = "--";
      worstRssiEl.className = "rssi-value";
      worstDistEl.textContent = "";
    }

    // Update confidence display with helpful info
    if (typeof bestRssi === "number") {
      const bestEstimate = this.distanceEstimator.estimateDistance(
        bestRssi,
        false
      );
      const reliabilityNote = bestEstimate.reliable
        ? "Estimate based on BLE signal strength"
        : "⚠️ Weak signal - estimate may be inaccurate";

      confidenceEl.innerHTML = `<span style="font-size: 10px; color: #888;">${reliabilityNote}</span>`;
    } else {
      confidenceEl.innerHTML = "";
    }
  }

  /**
   * Get CSS class for RSSI strength visualization
   * @param {number} rssi - RSSI value in dBm
   * @returns {string} CSS class name
   */
  getRssiStrengthClass(rssi) {
    if (rssi >= -50) {
      return "strong"; // Excellent signal
    } else if (rssi >= -70) {
      return "medium"; // Good signal
    } else {
      return "weak"; // Poor signal
    }
  }

  async handleClick({ id, type, value, timestamp, event }) {
    debug("clicked type=", type, value, timestamp, event);

    if (type == "ble") {
      debug("shift", event.originalEvent.shiftKey);

      //this.selectedLayers = [ value ]

      let layer = Leaflet.layerGroup();

      //let device = this.getBLEDevice(value)
      //let device = this.db.getCollection('ble').findOne({'$loki':id})

      let station = (
        await this.party
          .find()
          .type("ble_station")
          .id(id)
          .exec()
      )[0];

      if (!station) {
        console.log("no station");
        return;
      }

      /*
      let devAdvs = (await this.party.find().type('ble_adv').where('address').equals(station.data.address).exec())

      let devAdv = devAdvs[0]

      if(!devAdv){ 
        console.log('no adv')
        return }

      let devicePathLL = []


      let trackPointQuery = []
      

      for(let observation of devAdv.data.packet.seen){
        console.log(observation)
        trackPointQuery.push( this.getTrackPointByTime(observation.time) )
      }

      let trackPoints = await Promise.all(trackPointQuery)

      for(let pt of trackPoints){

        console.log('pt', pt)


        if(pt){ 
          devicePathLL.push([ pt.lat, pt.lon ])
          let circle = Leaflet.circle([pt.lat, pt.lon], { color: 'green', radius: 8, fill:true, weight:1, opacity: 0.9 })

          circle.on('click', (event)=>{
            this.handleClick({
              event,
              type: 'ble', 
              id: station.id,
              value: station.data.address,
              timestamp: observation.time
            })
          })

          layer.addLayer(circle)
        }
      }


      if(devicePathLL.length > 0){
        let line = Leaflet.polyline(devicePathLL, { color: 'green', opacity: 0.9, weight: '4' })

        line.on('click', (event)=>{
          this.handleClick({
            event,
            type: 'ble', 
            id: station.id,
            value: station.data.address,
            timestamp: station.data.timebounds.last
          })
        })
        layer.addLayer(line)
      }*/

      if (!event.originalEvent.shiftKey) {
        for (let mac in this.deviceLayers) {
          let l = this.deviceLayers[mac];
          this.map.removeLayer(l);

          delete this.deviceLayers[mac];
        }
      }

      this.deviceLayers[value] = layer;
      layer.addTo(this.map);

      await this.updateDeviceInfoHud(station);
    }
  }

  async getTrackPointByTime(timestamp) {
    let bestDeltaMs = null;
    let bestPoint = null;
    let tracks = await this.getTracksByTime(
      timestamp - 600000,
      timestamp + 600000
    );

    for (let track of tracks) {
      for (let point of track.data.points) {
        let deltaMs = Math.abs(moment(timestamp).diff(point.time));

        if (deltaMs < bestDeltaMs || bestDeltaMs == null) {
          bestDeltaMs = deltaMs;
          bestPoint = point;
        }
      }
    }

    if (bestPoint) {
      bestPoint = {
        lat: bestPoint.latitude,
        lon: bestPoint.longitude,
      };
    }

    return bestPoint;
  }

  async getTracksByTime(starttime, endtime) {
    let tracks = await this.party
      .find()
      .type("geo_track")
      //.sort('-timebounds.last')
      .or()
      .and() //endtime within timebounds
      .where("timebounds.first")
      .lt(endtime)
      .where("timebounds.last")
      .gt(endtime)
      .dna()
      .and() //starttime within timebounds
      .where("timebounds.first")
      .lt(starttime)
      .where("timebounds.last")
      .gt(starttime)
      .dna()
      .and() //
      .where("timebounds.first")
      .lt(endtime)
      .where("timebounds.first")
      .gt(starttime)
      .dna()
      .and()
      .where("timebounds.last")
      .lt(endtime)
      .where("timebounds.last")
      .gt(starttime)
      .exec();

    return tracks;
  }

  trackToLatLonArray(track) {
    let llarr = [];

    for (let point of track) {
      llarr.push([point.lat, point.lon]);
    }

    return llarr;
  }

  async getTrackPointsByTime(start, end) {
    let llpoints = [];
    let tracks = await this.getTracksByTime(start, end);

    for (let track of tracks) {
      for (let point of track.data.points) {
        llpoints.push(Leaflet.point(point.latitude, point.longitude));
      }
    }

    return llpoints;
  }

  async getTrackBoundsByTime(starttime, endtime) {
    let points = await this.getTrackPointsByTime(starttime, endtime);

    return Leaflet.bounds(points);
  }

  static get Version() {
    return Pkg.version;
  }

  static lookupDeviceCompany(code) {
    return MANUFACTURER_TABLE.Company[code];
  }

  static lookupAppleService(code) {
    return DeviceIdentifiers.APPLE_Continuity[code];
  }

  static lookupUuid16(uuid) {
    const types = Object.keys(UUID16_TABLES);

    for (let type of types) {
      let found = UUID16_TABLES[type][uuid];

      if (found) {
        return "/" + type + "/" + found;
      }
    }
  }

  static lookupDeviceUuid(uuid) {
    let deviceType = null;

    if (uuid.length == 4) {
      //deviceType = DeviceIdentifiers.UUID16[uuid]
      deviceType = RFParty.lookupUuid16(uuid);
    } else if (uuid.length == 32) {
      deviceType = DeviceIdentifiers.UUID[uuid];
    }

    return deviceType;
  }

  static reverseLookupService(term) {
    let possibles = [];

    const types = Object.keys(UUID16_TABLES);

    for (let type of types) {
      possibles.push(
        ...RFParty.reverseLookupByName(
          UUID16_TABLES[type],
          term,
          "/" + type + "/"
        ).map((name) => {
          return "/" + type + "/" + name;
        })
      );
    }

    return possibles.concat(
      RFParty.reverseLookupByName(DeviceIdentifiers.APPLE_Continuity, term),
      RFParty.reverseLookupByName(DeviceIdentifiers.UUID, term)
    );
  }

  static reverseLookupByName(map, text, prefix = "") {
    let names = [];
    const lowerText = text.toLowerCase();
    for (let code in map) {
      const name = map[code];
      const prefixedName = prefix + name;
      const lowerName = prefixedName.toLowerCase();

      if (lowerName.indexOf(lowerText) != -1) {
        names.push(name);
      }
    }

    return names;
  }
}
