// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// @ts-nocheck
import * as EmulationModelModule from '../../models/emulation/emulation.js';
import * as EmulationModule from './emulation.js';
self.Emulation = self.Emulation || {};
Emulation = Emulation || {};
/**
 * @constructor
 */
Emulation.AdvancedApp = EmulationModule.AdvancedApp.AdvancedApp;
/**
 * @constructor
 */
Emulation.AdvancedAppProvider = EmulationModule.AdvancedApp.AdvancedAppProvider;
/**
 * @constructor
 */
Emulation.DeviceModeModel = EmulationModelModule.DeviceModeModel.DeviceModeModel;
/** @enum {string} */
Emulation.DeviceModeModel.Type = EmulationModelModule.DeviceModeModel.Type;
/**
 * @constructor
 */
Emulation.DeviceModeView = EmulationModule.DeviceModeView.DeviceModeView;
/**
 * @constructor
 */
Emulation.DeviceModeWrapper = EmulationModule.DeviceModeWrapper.DeviceModeWrapper;
/**
 * @constructor
 */
Emulation.DeviceModeWrapper.ActionDelegate = EmulationModule.DeviceModeWrapper.ActionDelegate;
/**
  * @constructor
  */
Emulation.EmulatedDevice = EmulationModelModule.EmulatedDevices.EmulatedDevice;
/**
 * @constructor
 */
Emulation.EmulatedDevicesList = EmulationModelModule.EmulatedDevices.EmulatedDevicesList;
/**
 * @constructor
 */
Emulation.InspectedPagePlaceholder = EmulationModule.InspectedPagePlaceholder.InspectedPagePlaceholder;
Emulation.InspectedPagePlaceholder.instance =
    EmulationModule.InspectedPagePlaceholder.InspectedPagePlaceholder.instance;
/**
 * @constructor
 */
Emulation.MediaQueryInspector = EmulationModule.MediaQueryInspector.MediaQueryInspector;
//# sourceMappingURL=emulation-legacy.js.map