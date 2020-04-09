const debug = require('debug')('gate-addon-modbus');
const EventEmitter = require('events');
const async = require('async');
const ModbusRTU = require('modbus-serial');
const _ = require('lodash');
const modbusHerdsman = require('@instathings/modbus-herdsman-converters');

class GateAddOnModbus extends EventEmitter {
  constructor(id, type, allDevices, options = {}) {
    super();
    this.id = id;
    this.data = {};
    const modbusId = type.protocols[0];
    this.knownDevices = allDevices[modbusId] || [];
    this.deviceType = type;
    /**
     * {
     *   baudRate: 
     *   modbusDeviceId: 
     * }
     */
    this.options = options;
  }

  setKnownDevices(knownDevices) {
    this.knownDevices = knownDevices;
  }

  init() {
    this.client = new ModbusRTU();
    this.client.setTimeout(500);
    const modbusDeviceId = this.options.modbusDeviceId || 1;
    this.client.connectRTUBuffered('/dev/ttyUSB0', { baudRate: this.options.baudRate || 9600 }, async () => {
      await this.client.setID(modbusDeviceId);
      setInterval(() => {
        this.start();
      }, 10000);
    });
    // TODO on "internalNewDeviceTimeout" emit "timeoutDiscovering"
    // TODO on "internalNewDevice" emit "newDevice"
  }

  start() {
    const { model } = this.deviceType;
    const descriptor = modbusHerdsman.findByModbusModel(model);
    const result = {};
    const keys = Object.keys(descriptor.input);

    return async.eachSeries(keys, async (key) => {
      const addressDescriptor = _.get(descriptor, `input.${key}`);
      const address = _.get(addressDescriptor, 'address');
      let value;
      try {
        value = await this.client.readInputRegisters(address, 1);
      } catch (err) {
        debug(err);
      }
      const { post } = addressDescriptor;
      value = _.get(value, 'data[0]');
      value = (post && value) ? post(value) : value;
      _.set(result, key, value);
    }, () => {
      debug('emit');
      debug(result);
      this.emit('data', result);
    });
  }

  stop() { }

  control(message, action) {
    // should emit "status" event if action is get   
  }

  remove() {
    // should emit "deviceRemoved" event
    this.emit('deviceRemoved');
  }
}

module.exports = GateAddOnModbus;
