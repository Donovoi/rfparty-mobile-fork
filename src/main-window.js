import { RFParty } from "./rfparty";
import { LoadingProgress } from "./loading-progress";

const Debug = require("debug/src/browser");
const debug = Debug("MainWindow");
const onLocationDebug = Debug("geolocation");
const moment = require("moment");

const Dataparty = window.Dataparty;
const RFPartyModel = require("../dataparty/xyz.dataparty.rfparty.dataparty-schema.json");
const RFPartyDbModel = {
  ...RFPartyModel,
  JSONSchema: (RFPartyModel.JSONSchema || []).filter(
    (schema) =>
      RFPartyModel.IndexSettings && RFPartyModel.IndexSettings[schema.title]
  ),
};

const RFPartyDocuments = require("./documents");

const PermissionsDisclosureMessage =
  "This app requires permissions to function.\n\n" +
  "Location: Allows reading location data even in the background in order to map BLE signal propogation.\n\n" +
  "See the Privacy Policy for more information.";

//const BouncerModel = require('@dataparty/bouncer-model/dist/bouncer-model.json')

/*function debug(...args){
  debug('MainWindow -', ...args)
}*/

window.last_crash_count = parseInt(localStorage.getItem("crash_count")) || 0;
window.crash_count = parseInt(localStorage.getItem("crash_count")) || 0;

window.nodejs_pending_calls = 0;

const SearchSuggestions = {
  //help: false,
  here: false,
  name: true,
  company: true,
  address: "mac",
  product: true,
  service: ["name", "0x...", "company", "product"],
  "unknown-service": false,
  appleip: "ip",
  //random: false,
  //public: false,
  //connectable: false,
  duration: ["48h", "15m"],
  error: false,
};

window.lastScanStart = moment().subtract(10, "minutes");
window.isScanning = false;

window.locations = [];
window.advertisements = {};
window.seen_macs = {};

window.status_text = "";

window.channel = null;

export class MainWindow {
  static get scanWindow() {
    return 60000;
  }

  static async onload(divId, channel) {
    debug("RFParty.onload");
    if (window.bootLog) window.bootLog("MainWindow.onload: starting");

    try {
      if (window.bootLog)
        window.bootLog("MainWindow.onload: creating RFParty instance");
      window.rfparty = new RFParty(divId);
      if (window.bootLog)
        window.bootLog("MainWindow.onload: RFParty created, map initialized");
    } catch (err) {
      if (window.bootLog)
        window.bootLog(
          "MainWindow.onload: ERROR creating RFParty - " + (err.message || err)
        );
      throw err;
    }

    const form = document.getElementsByName("setupForm")[0];
    form.addEventListener("submit", MainWindow.startSession);

    const versionText = document.getElementById("version-text");
    if (versionText) {
      versionText.innerText = "v" + RFParty.Version;
    }

    window.channel = channel;
    if (window.bootLog)
      window.bootLog("MainWindow.onload: calling setupSession");
    await MainWindow.setupSession();
    if (window.bootLog)
      window.bootLog("MainWindow.onload: setupSession complete");
  }

  static hideDiv(divId) {
    return MainWindow.addRemoveClass(divId, "add", "hidden");
  }

  static showDiv(divId) {
    return MainWindow.addRemoveClass(divId, "remove", "hidden");
  }

  static addRemoveClass(
    divId,
    addRemove = "add",
    className = "hidden",
    display = "block"
  ) {
    var div = document.getElementById(divId);

    //debug('div', addRemove, className, div)

    if (addRemove === "remove") {
      div.classList.remove(className);

      if (className == "hidden") {
        div.style.display = display;
      }
      //debug('remove')
    } else {
      //debug('add')

      if (className == "hidden") {
        div.style.display = "none";
      }
      div.classList.add(className);
    }
  }

  static openSetupForm() {
    MainWindow.showDiv("setup-modal");
    MainWindow.showDiv("modal-shadow");
    MainWindow.showDiv("logo");
    MainWindow.showDiv("center-modal", "remove", "hidden", "flex");
  }

  static closeSetupForm() {
    if (window.rfparty == null) {
      return;
    }

    MainWindow.hideDiv("center-modal");
    MainWindow.hideDiv("logo");
    MainWindow.hideDiv("setup-modal");
  }

  static async reload() {
    MainWindow.showDiv("loading-text");
    MainWindow.showDiv("loading-progress-bar");
    MainWindow.hideDiv("loading-start-button");
    await MainWindow.setupSession();
  }

  static openLoading() {
    MainWindow.showDiv("modal-shadow");
    MainWindow.showDiv("center-modal", "remove", "hidden", "flex");
    MainWindow.showDiv("logo");
    MainWindow.showDiv("loading-bar");

    MainWindow.addRemoveClass("logo", "add", "rainbow-busy");

    window.loadingState = new LoadingProgress();

    window.loadingState.on("step-start", (name) => {
      document.getElementById(
        "loading-details"
      ).value = window.loadingState.toString();
    });

    window.loadingState.on("step-progress", () => {
      const progress = window.loadingState.progress;
      document.getElementById(
        "loading-details"
      ).value = window.loadingState.toString();
      document.getElementById("loading-value").innerText =
        "" + Math.round(progress * 100);
      document.getElementById("loading-progress-bar").value = progress * 100;
    });

    window.loadingState.on("step-complete", (name) => {
      document.getElementById(
        "loading-details"
      ).value = window.loadingState.toString();
    });

    window.loadingState.on("progress", (progress) => {
      document.getElementById("loading-value").innerText =
        "" + Math.round(progress * 100);
      document.getElementById("loading-progress-bar").value = progress * 100;
    });

    window.loadingState.on("error", ({ step }) => {
      MainWindow.hideDiv("loading-text");
      MainWindow.hideDiv("loading-progress-bar");
      MainWindow.showDiv("loading-start-button");
    });
  }

  static closeLoading() {
    MainWindow.addRemoveClass("center-modal", "add", "fadeOut");

    setTimeout(() => {
      MainWindow.hideDiv("center-modal");
      MainWindow.hideDiv("logo");
      MainWindow.hideDiv("modal-shadow");
      MainWindow.hideDiv("loading-bar");
      MainWindow.addRemoveClass("logo", "remove", "rainbow-busy");
    }, 2000);
  }

  static async startSession(event) {
    if (event) {
      event.preventDefault();
    }
    debug("startSession");

    MainWindow.closeSetupForm();
    MainWindow.openLoading();

    await MainWindow.setupSession();

    MainWindow.closeLoading();
  }

  static async delay(ms = 100) {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, ms);
    });
  }

  static async onLocation(location) {
    onLocationDebug("location", location);

    const point = {
      time: moment(location.time).valueOf(),
      accuracy: location.accuracy,
      altitude: location.altitude,
      bearing: location.bearing,
      latitude: location.latitude,
      longitude: location.longitude,
      speed: location.speed,

      isStationary: location.isStationary ? true : false,

      provider: location.provider,
      locationProvider: location.locationProvider,
      isFromMockProvider: location.isFromMockProvider ? true : undefined,
      mockLocationsEnabled: location.mockLocationsEnabled ? true : undefined,
    };

    window.rfparty.indexLocation(point);
    MainWindow.scanLoop();
  }

  static async onBleDevice(dev) {
    debug("device", dev);

    window.rfparty.indexDevice(dev);
    MainWindow.scanLoop();
  }

  static get Permissions() {
    return [
      cordova.plugins.permissions.ACCESS_FINE_LOCATION,
      cordova.plugins.permissions.ACCESS_COARSE_LOCATION,
      //cordova.plugins.permissions.ACTIVITY_RECOGNITION,
      cordova.plugins.permissions.ACCESS_BACKGROUND_LOCATION,
      cordova.plugins.permissions.WAKE_LOCK,
      //cordova.plugins.permissions.BLUETOOTH_SCAN
    ];
  }

  static async hasPermission(perm) {
    return new Promise((resolve, reject) =>
      cordova.plugins.permissions.checkPermission(perm, resolve, reject)
    );
  }

  static async requestPermissions(perms) {
    debug("requesting permissions", perms);

    let result = {
      allowed: [],
      denied: [],
    };

    for (let perm of perms) {
      debug("requesting permission", perm);

      let req = await new Promise((resolve, reject) =>
        cordova.plugins.permissions.requestPermission(perm, resolve, reject)
      );

      //result.push({ permission:perm , ... req})
      debug("\treq", req);
      if (req.hasPermission) {
        result.allowed.push(perm);
      } else {
        result.denied.push(perm);
      }
    }

    return result;
  }

  static async isLocationEnabled() {
    try {
      let geoEA = new Promise((resolve, reject) => {
        ble.isLocationEnabled(resolve, reject);
      });
      await geoEA;
    } catch (err) {
      return false;
    }

    return true;
  }

  static async isBleEnabled() {
    try {
      await ble.withPromises.isEnabled();
    } catch (err) {
      return false;
    }

    return true;
  }

  static async displayConfirm(title, content, timeoutMs = 60000) {
    //return window.confirm(content)

    return new Promise((resolve, reject) => {
      // Add timeout - default to "OK" after timeout
      const timeout = setTimeout(() => {
        debug("displayConfirm - timeout, assuming user accepted");
        if (window.bootLog)
          window.bootLog("displayConfirm: timeout, assuming OK");
        resolve(1); // 1 = OK button index
      }, timeoutMs);

      navigator.notification.confirm(
        content,
        (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        title
      );
    });
  }

  static async checkPermissions(prompt = false) {
    debug("checkPermissions - ", MainWindow.Permissions);
    let needs = [];
    for (let perm of MainWindow.Permissions) {
      if (!(await MainWindow.hasPermission(perm)).hasPermission) {
        needs.push(perm);
      }
    }

    debug("needs permissions", needs);

    if (needs.length > 0) {
      if (prompt) {
        let answer = await MainWindow.displayConfirm(
          "Permissions Required",
          PermissionsDisclosureMessage
        );

        console.log("user answer", answer);

        if (answer != true) {
          return Promise.reject(
            "User rejected required permissions. The app cannot function without the requested permissions."
          );
        }
      }

      let request = await MainWindow.requestPermissions(needs);

      //if(!request.hasPermission){
      debug("permissions request result");
      debug(JSON.stringify(request, null, 2));
      //}

      return request;
    }
  }

  static async setupBlePermissions() {
    debug("setupBlePermissions");
    const bluetoothSetup = await MainWindow.isBluetoothSetup();
    if (!bluetoothSetup) {
      debug("setupBlePermissions - setting permissions");
      try {
        await MainWindow.setupBluetoothPermissions();
      } catch (err) {
        return false;
      }
    }

    if (!(await MainWindow.isBleEnabled())) {
      debug("setupBlePermissions - enabling BLE hw programtically");
      await ble.withPromises.enable();
    }

    cordova.plugins.diagnostic.registerBluetoothStateChangeHandler(function(
      state
    ) {
      debug("bluetooth state changed - ", state);
    });

    /*while(! (await MainWindow.isBleEnabled())){
      debug('prompting user to enable ble')
      await ble.withPromises.showBluetoothSettings()
    }*/

    return true;
  }

  static async hasBluetoothSupport() {
    return new Promise((resolve, reject) => {
      debug("hasBluetoothSupport - checking");

      // Add timeout to prevent blocking forever
      const timeout = setTimeout(() => {
        debug("hasBluetoothSupport - timeout, assuming supported");
        if (window.bootLog)
          window.bootLog("hasBluetoothSupport: timeout, assuming true");
        resolve(true);
      }, 5000);

      //cordova.plugins.diagnostic.hasBluetoothSupport((supported)=>{
      cordova.plugins.diagnostic.hasBluetoothLESupport(
        (supported) => {
          clearTimeout(timeout);
          debug("hasBluetoothSupport - result:", supported);
          resolve(supported);
        },
        (err) => {
          clearTimeout(timeout);
          debug("hasBluetoothSupport - error:", err);
          reject(err);
        }
      );
    });
  }

  static async isBluetoothSetup() {
    return new Promise((resolve, reject) => {
      debug("isBluetoothSetup - checking");

      // Add timeout to prevent blocking forever
      const timeout = setTimeout(() => {
        debug("isBluetoothSetup - timeout, assuming not setup");
        if (window.bootLog) window.bootLog("isBluetoothSetup: timeout");
        resolve(false);
      }, 5000);

      cordova.plugins.diagnostic.getBluetoothAuthorizationStatuses(
        (statuses) => {
          clearTimeout(timeout);
          let granted = 0;
          for (var permission in statuses) {
            let permEA = statuses[permission] == "GRANTED";

            if (permEA) {
              granted++;
            }

            debug(
              "isBluetoothSetup - " +
                permission +
                " permission is: " +
                statuses[permission]
            );
          }

          resolve(granted == 3);
        },
        (err) => {
          clearTimeout(timeout);
          reject(err);
        }
      );
    });
  }

  static async setupBluetoothPermissions() {
    return new Promise((resolve, reject) => {
      const permissions = [
        "BLUETOOTH_SCAN",
        "BLUETOOTH_CONNECT",
        "BLUETOOTH_ADVERTISE",
      ];

      // Add timeout to prevent blocking forever
      const timeout = setTimeout(() => {
        debug("setupBluetoothPermissions - timeout");
        if (window.bootLog)
          window.bootLog("setupBluetoothPermissions: timeout");
        resolve(); // Resolve anyway to continue
      }, 30000);

      cordova.plugins.diagnostic.requestBluetoothAuthorization(
        () => {
          clearTimeout(timeout);
          resolve();
        },
        (err) => {
          clearTimeout(timeout);
          reject(err);
        },
        permissions
      );
    });
  }

  static async waitForHardware(maxWaitMs = 30000) {
    const startTime = Date.now();
    let attempts = 0;

    while (!(await MainWindow.isLocationEnabled())) {
      attempts++;
      debug("waiting for location hw, attempt", attempts);
      if (window.bootLog && attempts % 10 === 0) {
        window.bootLog(
          "waitForHardware: attempt " + attempts + " - location not enabled"
        );
      }

      // Check timeout
      if (Date.now() - startTime > maxWaitMs) {
        debug("waitForHardware timeout after", maxWaitMs, "ms");
        if (window.bootLog) {
          window.bootLog(
            "waitForHardware: TIMEOUT - location still not enabled after " +
              maxWaitMs / 1000 +
              "s"
          );
        }
        // Don't throw, just continue - maybe user will enable it later
        break;
      }

      await MainWindow.delay(500);
    }

    if (await MainWindow.isLocationEnabled()) {
      debug("location hw ready");
      if (window.bootLog) window.bootLog("waitForHardware: location enabled");
    }
  }

  static async stopScan() {
    await new Promise((resolve, reject) => {
      ble.stopScan(resolve, reject);
    });
  }

  static async isScreenOff() {
    return new Promise((resolve, reject) => {
      cordova.plugins.backgroundMode.isScreenOff(resolve);
    });
  }

  static async scanLoop() {
    let now = moment();
    let deltaMs = now.diff(window.lastScanStart, "ms");

    if (deltaMs < MainWindow.scanWindow) {
      return;
    }

    debug("scanLoop");

    if (await MainWindow.isBleEnabled()) {
      if (window.isScanning) {
        debug("scanLoop - stopping ble scan");
        await MainWindow.stopScan();
        window.isScanning = false;
      }

      debug("scanLoop - starting ble scan", moment().format());

      ble.startScanWithOptions(
        [],
        {
          reportDuplicates: false,
          scanMode: "lowLatency",
          reportDelay: 0,
        },
        MainWindow.onBleDevice,
        console.error
      );

      if (
        cordova.plugins.backgroundMode.isActive() /*&& await MainWindow.isScreenOff()*/
      ) {
        debug("\t scanLoop - WAKE UP - ", moment().format());
        cordova.plugins.backgroundMode.wakeUp();
      }

      window.isScanning = true;
      window.lastScanStart = now;

      MainWindow.checkGeoLocation();
      setTimeout(MainWindow.scanLoop, MainWindow.scanWindow);

      BackgroundGeolocation.configure({
        notificationTitle: "rfparty (" + window.status_text + ")",
        notificationText: "partying in background",
      });

      return;
    } else {
      debug("scanLoop - ble not enabled");

      window.isScanning = false;
    }

    setTimeout(MainWindow.scanLoop, MainWindow.scanWindow);
  }

  static async setupDb() {
    debug("setupDb - starting");
    if (window.bootLog) window.bootLog("setupDb: starting");

    if (!Dataparty) {
      throw new Error(
        "Dataparty library not loaded. Check dataparty-browser.js."
      );
    }

    if (window.bootLog) window.bootLog("setupDb: creating config");
    let config = new Dataparty.Config.LocalStorageConfig({
      basePath: "rfparty-config",
    });

    if (window.bootLog) window.bootLog("setupDb: creating ZangoParty");
    let party = new Dataparty.ZangoParty({
      dbname: "rfparty-zango-db",
      noCache: true,
      model: RFPartyDbModel,
      factories: RFPartyDocuments,
      config: config,
      qbOptions: {
        debounce: false,
        find_dedup: true,
        timeout: false,
      },
    });

    // Patch: ZangoDb.start() accesses factory.model.IndexSettings but
    // DocumentFactory doesn't store the model. Set it explicitly.
    party.factory.model = RFPartyDbModel;

    if (window.bootLog) window.bootLog("setupDb: starting party");
    await party.start();
    if (window.bootLog) window.bootLog("setupDb: party started");

    if (window.bootLog) window.bootLog("setupDb: starting rfparty");
    await window.rfparty.start(party);
    if (window.bootLog) window.bootLog("setupDb: rfparty started");
  }

  static checkGeoLocation() {
    BackgroundGeolocation.checkStatus(function(status) {
      debug("geolocation service is running", status.isRunning);
      debug("geolocation services enabled", status.locationServicesEnabled);

      if (!status.isRunning) {
        debug("geolocation - start");
        BackgroundGeolocation.start(); //triggers start on start event
      }
    });
  }

  static setupGeoLocation() {
    let locationProvider = BackgroundGeolocation.RAW_PROVIDER;

    BackgroundGeolocation.configure({
      startOnBoot: false,
      notificationsEnabled: false,
      //maxLocations: 30,
      locationProvider: locationProvider,
      desiredAccuracy: BackgroundGeolocation.HIGH_ACCURACY,
      stationaryRadius: 5,
      distanceFilter: 1,
      notificationTitle: "rfparty",
      notificationText: "partying in background",
      debug: false,
      interval: 5000,
      fastestInterval: 1000,
      activitiesInterval: 5000,
    });

    BackgroundGeolocation.on("location", MainWindow.onLocation);

    BackgroundGeolocation.on("background", function() {
      onLocationDebug("[INFO] App is in background");
      // you can also reconfigure service (changes will be applied immediately)
      //BackgroundGeolocation.configure({ debug: true });
    });

    BackgroundGeolocation.on("foreground", function() {
      onLocationDebug("[INFO] App is in foreground");
      //BackgroundGeolocation.configure({ debug: false });
    });

    BackgroundGeolocation.on("stationary", function(stationaryLocation) {
      // handle stationary locations here
      onLocationDebug("geolocation - stationary", stationaryLocation);
      MainWindow.onLocation({ isStationary: true, ...stationaryLocation });
    });

    /*BackgroundGeolocation.on('activity', function(activity) {
      // handle stationary locations here
      onLocationDebug('geolocation - activity', activity)
    })*/

    BackgroundGeolocation.on("error", function(error) {
      onLocationDebug(
        "[ERROR] BackgroundGeolocation error:",
        error.code,
        error.message
      );
    });

    BackgroundGeolocation.on("start", function() {
      onLocationDebug("[INFO] BackgroundGeolocation service has been started");
    });

    BackgroundGeolocation.on("stop", function() {
      onLocationDebug("[INFO] BackgroundGeolocation service has been stopped");
    });

    BackgroundGeolocation.checkStatus(function(status) {
      onLocationDebug(
        "[INFO] BackgroundGeolocation service is running",
        status.isRunning
      );
      onLocationDebug(
        "[INFO] BackgroundGeolocation services enabled",
        status.locationServicesEnabled
      );
      onLocationDebug(
        "[INFO] BackgroundGeolocation auth status: " + status.authorization
      );

      if (!status.isRunning) {
        BackgroundGeolocation.start();
      }
    });

    //BackgroundGeolocation.start()
  }

  static updateStatus(color) {
    let locationCount = window.rfparty.locationCount;
    let stationCount = window.rfparty.stationCount;
    let packetCount = window.rfparty.packetCount;

    window.status_text =
      "📨" + packetCount + " 🛰️" + stationCount + " 📍" + locationCount;

    if (window.crash_count > window.last_crash_count) {
      const crashes = window.crash_count - window.last_crash_count;
      window.status_text = "⚠️" + crashes + " " + window.status_text;
    }

    if (window.rfparty.party != null) {
      let nodePending = window.nodejs_pending_calls;
      if (nodePending > 0) {
        window.status_text = "📩" + nodePending + " " + window.status_text;
      }

      let pending = Object.keys(window.rfparty.party.qb.crufls).length;
      if (pending > 0) {
        window.status_text = "⏳" + pending + " " + window.status_text;
      }
    }

    MainWindow.setConnectionStatus(window.status_text, color || "green");
  }

  static async setupDisplay() {
    const p = (fn) => {
      return () => {
        return new Promise((resolve, reject) => {
          fn(resolve, reject);
        });
      };
    };

    let supported = await p(AndroidFullScreen.isSupported)();
    supported =
      supported && (await p(AndroidFullScreen.isImmersiveModeSupported)());

    if (!supported) {
      console.log("not full screen");
      return;
    }

    //await (p(AndroidFullScreen.showUnderSystemUI)())

    await p(AndroidFullScreen.immersiveMode)();

    let dimensionsImmersiveFinal = {
      width: await p(AndroidFullScreen.immersiveWidth)(),
      height: await p(AndroidFullScreen.immersiveHeight)(),
    };

    let dimensionsHtmlFinal = {
      width: window.screen.width * window.devicePixelRatio,
      height: window.screen.height * window.devicePixelRatio,
    };

    console.log("html5final dimensions final", dimensionsHtmlFinal);

    console.log("immersive dimensions final", dimensionsImmersiveFinal);
  }

  static async setupSession() {
    debug("setupSession - starting");
    if (window.bootLog) window.bootLog("setupSession: starting");

    MainWindow.closeSetupForm();
    MainWindow.openLoading();

    if (window.bootLog) window.bootLog("setupSession: loading UI opened");

    let permissions = null;

    await window.loadingState.run("configure permissions", async () => {
      if (window.bootLog)
        window.bootLog("setupSession: configuring permissions");
      cordova.plugins.backgroundMode.setDefaults({
        title: "rfparty",
        text: "partying in the background",
        icon: "ic_launcher", // this will look for icon.png in platforms/android/res/drawable|mipmap
        color: "000000", // hex format like 'F14F4D'
        //resume: Boolean,
        //hidden: true,
        silent: true,
        //bigText: Boolean
      });

      cordova.plugins.backgroundMode.overrideBackButton();

      cordova.plugins.backgroundMode.enable();

      let hasBLE = await MainWindow.hasBluetoothSupport();

      if (!hasBLE) {
        throw new Error("This device does not have BLE support!");
      }

      let permissionsOk = false;
      let bleEA = false;
      let permissionAttempts = 0;
      const maxPermissionAttempts = 5;

      while (!permissionsOk || !bleEA) {
        permissionAttempts++;
        if (window.bootLog)
          window.bootLog(
            "setupSession: permission attempt " + permissionAttempts
          );

        if (permissionAttempts > maxPermissionAttempts) {
          debug("Max permission attempts reached, continuing anyway");
          if (window.bootLog)
            window.bootLog(
              "setupSession: max permission attempts reached, continuing"
            );
          break;
        }

        if (!permissionsOk) {
          permissions = await MainWindow.checkPermissions(true);
          debug("got permissions result", permissions);
          if (
            permissions &&
            permissions.denied &&
            permissions.denied.length > 0
          ) {
            if (permissions.denied.length > 1) {
              permissionsOk = false;
            } else if (
              permissions.denied.indexOf(
                "android.permission.ACTIVITY_RECOGNITION"
              ) != -1
            ) {
              permissionsOk = true;
            } else {
              permissionsOk = true;
            }
          } else {
            permissionsOk = true;
          }
        }

        if (!bleEA) {
          if (window.bootLog)
            window.bootLog("setupSession: setting up BLE permissions");
          bleEA = await MainWindow.setupBlePermissions();
        }

        if (!bleEA || !permissionsOk) {
          if (window.bootLog)
            window.bootLog(
              "setupSession: switching to settings (attempt " +
                permissionAttempts +
                ")"
            );
          await new Promise((resolve) => {
            cordova.plugins.diagnostic.switchToSettings(resolve, () => {});
          });
        }
      }
      if (window.bootLog)
        window.bootLog(
          "setupSession: permissions configured (ok=" +
            permissionsOk +
            ", ble=" +
            bleEA +
            ")"
        );
    });

    await window.loadingState.run("please enable location", async () => {
      if (window.bootLog)
        window.bootLog("setupSession: waiting for location hardware");
      await MainWindow.waitForHardware();
      if (window.bootLog)
        window.bootLog("setupSession: location hardware ready");
    });

    await window.loadingState.run("configure db", async () => {
      if (window.bootLog) window.bootLog("setupSession: configuring database");
      await MainWindow.setupDb();
      if (window.bootLog) window.bootLog("setupSession: database configured");
    });

    await window.loadingState.run("configure hardware", async () => {
      if (window.bootLog) window.bootLog("setupSession: configuring hardware");
      await MainWindow.scanLoop();

      window.watchdogInterval = setInterval(async () => {
        await MainWindow.scanLoop();
      }, 5 * 1000);

      MainWindow.setupDisplay();

      MainWindow.setupGeoLocation();
      if (window.bootLog) window.bootLog("setupSession: hardware configured");

      window.powerManagement.setReleaseOnPause(
        false,
        function() {
          debug("wakelock - Set successfully");

          window.powerManagement.cpu(
            function() {
              debug("Wakelock - cpu lock acquired");
            },
            function() {
              debug("wakelock - Failed to acquire wakelock");
            },
            false
          );
        },
        function() {
          debug("wakelock - Failed to set");
        }
      );
    });

    window.rfparty.on("station_count", () => {
      MainWindow.updateStatus("green");
    });

    window.rfparty.on("packet_count", () => {
      MainWindow.updateStatus("limegreen");
    });

    window.rfparty.on("location_count", () => {
      MainWindow.updateStatus("blue");
    });

    window.addEventListener("unhandledrejection", function(
      promiseRejectionEvent
    ) {
      let reason;
      try {
        reason = promiseRejectionEvent.reason;
        JSON.stringify(reason); //check we can sting it
      } catch (err) {
        reason = promiseRejectionEvent.reason.toString();
      }

      window.crash_count++;
      localStorage.setItem("crash_count", window.crash_count);

      let event = {
        rejection: {
          reason: reason,
          type: promiseRejectionEvent.type,
        },
      };

      console.log(event);
      console.log(JSON.stringify(event));
      localStorage.setItem(
        "crash-" + window.crash_count,
        JSON.stringify(event, null, 2)
      );

      MainWindow.updateStatus();
    });

    window.onerror = function(message, source, lineNumber, colno, error) {
      console.warn(`UNHANDLED ERROR: ${error.stack}`);

      let event = {
        exception: {
          message,
          source,
          lineNumber,
          colno,
          error,
        },
      };

      if (
        message.indexOf("undefined (reading 'toggle')") > -1 ||
        message.indexOf("Cannot read property 'toggle' of undefined")
      ) {
        // Ignore
        return;
      }

      window.crash_count++;
      localStorage.setItem("crash_count", window.crash_count);
      console.log(event);
      console.log(JSON.stringify(event));
      localStorage.setItem(
        "crash-" + window.crash_count,
        JSON.stringify(event, null, 2)
      );

      MainWindow.updateStatus();
    };

    MainWindow.updateStatus();

    let searchElem = document.getElementById("search-input");
    let searchStatusElem = document.getElementById("search-status");
    let hintElem = document.getElementById("search-hint");

    searchElem.disabled = false;

    try {
      if (typeof universalLinks !== "undefined") {
        universalLinks.subscribe("sharedQuery", function(eventData) {
          console.log("Launched from link: " + eventData.url);
          console.log(eventData);

          const input = eventData.path
            .replace("/query/", "")
            .replace("/", " ")
            .trim();

          searchElem.value = input;
          MainWindow.doSearch(searchElem.value, { deeplink: true });
        });
      }
    } catch (err) {
      debug("universalLinks not available:", err);
    }

    window.rfparty.on("update-start", () => {
      window.MainWindow.hideDiv("search-hint");
      searchStatusElem.innerText = "updating . . .";
      window.MainWindow.showDiv("search-status");
    });

    window.rfparty.on("search-start", () => {
      window.MainWindow.hideDiv("search-hint");
      searchStatusElem.innerText = "querying . . .";
      window.MainWindow.showDiv("search-status");
    });

    window.rfparty.on("search-finished", (data) => {
      window.MainWindow.hideDiv("search-hint");
      searchStatusElem.innerText =
        "rendering " + data.render.count + " devices . . .";
      window.MainWindow.showDiv("search-status");
    });

    window.rfparty.on("search-failed", (data) => {
      window.MainWindow.hideDiv("search-hint");
      searchStatusElem.innerText = "invalid search";
      window.MainWindow.showDiv("search-status");
    });

    window.rfparty.on("update-finished", (data) => {
      debug("update complete", data.updateDuration, data);
      let updateTime = Math.round((data.updateDuration / 1000) * 100) / 100;
      searchStatusElem.innerText =
        "showing " +
        data.render.onscreen +
        " out of " +
        data.render.count +
        " results in " +
        updateTime +
        " seconds";
      window.MainWindow.showDiv("search-status");
    });

    searchElem.addEventListener("input", (event) => {
      console.log("search input", event);
      MainWindow.updateHints(event.target.value);
    });

    searchElem.addEventListener("focus", (event) => {
      console.log("search focus", event);
      MainWindow.updateHints(searchElem.value || "help");
    });

    searchElem.addEventListener("focusout", (event) => {
      console.log("search focusout", event);
    });

    hintElem.addEventListener("focus", (event) => {
      console.log("hint focus", event);
      MainWindow.updateHints(searchElem.value || "help");
    });

    hintElem.addEventListener("focusin", (event) => {
      console.log("hint focusin", event);
      MainWindow.updateHints(searchElem.value || "help");
    });

    hintElem.addEventListener("focusout", (event) => {
      console.log("hint focusout", event);

      //if(document.activeElement !== searchElem){
      /*} else {
        MainWindow.updateHints(searchElem.value || 'help')
      }*/
    });

    searchElem.addEventListener("keydown", (event) => {
      if (event.key == "Enter") {
        setTimeout(() => {
          MainWindow.doSearch(searchElem.value);
        }, 5);
      }
    });

    searchElem.addEventListener("change", (event) => {
      const input = event.target.value;

      setTimeout(() => {
        MainWindow.doSearch(input);
      }, 5);
    });

    let mapElem = document.getElementById(window.rfparty.divId);

    mapElem.addEventListener("focus", () => {
      MainWindow.hideDiv("search-hint");
    });

    //await MainWindow.delay(10000)

    if (window.bootLog)
      window.bootLog("setupSession: COMPLETE - closing loading screen");
    MainWindow.closeLoading();
    debug("setupSession - complete");
  }

  static doSearch(input) {
    debug("search input", input);

    if (input == "help") {
      return;
    }

    let mapElem = document.getElementById(window.rfparty.divId);
    let searchStatusElem = document.getElementById("search-status");
    searchStatusElem.innerText = "searching . . .";
    MainWindow.showDiv("search-status");
    MainWindow.hideDiv("search-hint");

    mapElem.focus();

    setTimeout(() => {
      window.rfparty.handleSearch.bind(window.rfparty)(input);
    }, 10);
  }

  static updateHints(inputText) {
    const hints = MainWindow.searchSuggestion(inputText);

    console.log("hint", inputText, hints);

    let hintElem = document.getElementById("search-hint");

    if (hints.length == 0) {
      MainWindow.hideDiv("search-hint");
    } else if (hints.length == 1) {
      MainWindow.hideDiv("search-status");
      MainWindow.showDiv("search-hint");
      hintElem.innerHTML = hints[0];
    } else {
      MainWindow.hideDiv("search-status");
      MainWindow.showDiv("search-hint");
      hintElem.innerHTML = hints.join(
        '\n<hr id="hint-param-hr" class="hint-param-hr"/>'
      );
    }
  }

  static selectHint(hintKey) {
    console.log("selectHint", hintKey);

    let searchElem = document.getElementById("search-input");
    searchElem.value = hintKey;

    if (SearchSuggestions[hintKey] !== false) {
      MainWindow.updateHints(hintKey);
      searchElem.focus();
    } else {
      MainWindow.doSearch(hintKey);
    }
  }

  static updateHintsSelected(hintKey) {
    console.log("updateHintsSelected");
    let searchElem = document.getElementById("search-input");

    MainWindow.updateHints(searchElem.value);
  }

  static searchSuggestion(input) {
    if (input == "") {
      input = "help";
    }
    const terms = input.trim().split(" ");
    let term = terms[0].trim();

    let suggestions = [];

    if (term && terms.length >= 1) {
      term = term.toLowerCase();

      for (let key in SearchSuggestions) {
        const idx = key.indexOf(term);
        if (idx > -1 || term == "help") {
          let args = SearchSuggestions[key];
          let suggestion = `<div id="hint-${key}" onfocus="MainWindow.updateHintsSelected('${key}')" onclick="MainWindow.selectHint('${key}')"><span>• ${key}</span><span id="hint-params" class="hint-params">`;
          if (args == true) {
            suggestion += ` [${key}]`;
          } else if (typeof args == "string") {
            suggestion += ` [${args}]`;
          } else if (Array.isArray(args)) {
            suggestion += " [" + args.join(" | ") + "]";
          }

          suggestion += "</span></div>";

          suggestions.push(suggestion);

          /*if(idx == 0){
            return input + suggestion.replace(term, '') 
          }

          return input + suggestion*/
        }
      }
    }

    return suggestions;
  }

  static setConnectionStatus(text, color) {
    const statusText = document.getElementById("status-text");
    statusText.textContent = text + " ";

    const statusDot = document.getElementById("status-dot");
    statusDot.style.color = color;
    statusDot.style.backgroundColor = color;
  }

  static async writeChunk(writer, chunk) {
    return new Promise((resolve, reject) => {
      writer.onwriteend = resolve;
      writer.onerror = reject;

      const dataObj = new Blob([chunk], { type: "text/plain" });

      writer.write(dataObj);
    });
  }

  static splitByChunks(value, chunkLength) {
    return Array(Math.ceil(value.length / chunkLength))
      .fill(0)
      .map((_, index) =>
        value.slice(index * chunkLength, (index + 1) * chunkLength)
      );
  }

  static async writeFile(fileEntry, content) {
    return new Promise((resolve, reject) => {
      fileEntry.createWriter(async function(fileWriter) {
        const chunks = MainWindow.splitByChunks(content, 1024 * 1024);

        let idx = 0;

        for (let chunk of chunks) {
          try {
            console.log("\twriting chunk " + idx + "/" + chunks.length);
            idx++;
            await MainWindow.writeChunk(fileWriter, chunk);
          } catch (err) {
            reject(err);
          }
        }

        resolve();
      });
    });
  }

  static async getDirEntry(path) {
    return new Promise((resolve, reject) => {
      window.resolveLocalFileSystemURL(path, resolve, reject);
    });
  }

  static async createFile(fileName, content) {
    let dirEntry = await MainWindow.getDirEntry(
      cordova.file.externalApplicationStorageDirectory
    );

    return new Promise((resolve, reject) => {
      // Creates a new file or returns the file if it already exists.
      dirEntry.getFile(
        fileName,
        { create: true, exclusive: false },
        function(fileEntry) {
          try {
            resolve(MainWindow.writeFile(fileEntry, content));
          } catch (err) {
            reject(err);
          }
        },
        reject
      );
    });
  }

  static async exportDb() {
    console.log("exportDb");
    let now = new moment();
    let filePrefix = "export-" + now.format("YYYY.MM.DD-HH.mm.ss") + "-";

    const party = window.rfparty.party;

    let collectionNames = await party.db.getCollectionNames();

    console.log(collectionNames);

    for (let name of collectionNames) {
      let start = moment();

      console.log("exporting collection", name);

      let data = await party
        .find()
        .type(name)
        .exec(false);

      data = JSON.stringify(data, null, 2);

      const fileName = filePrefix + name + ".json";

      console.log(
        "writing file (" + Math.round(data.length / 1024) + " KB):",
        fileName
      );

      await MainWindow.createFile(fileName, data);

      let end = moment();

      console.log("duration", end.diff(start, "second") + "sec");
    }
  }
}
