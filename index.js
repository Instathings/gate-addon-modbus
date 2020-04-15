const _ = require('lodash');
const debug = require('debug')('gate-addon-modbus');
const EventEmitter = require('events');
const mqtt = require('mqtt');
const async = require('async');
const findDevices = require('./findDevices');

class GateAddOnModbus extends EventEmitter {
  constructor(id, type, allDevices, options = {}) {
    /**
     * options : {
     *    modbus_id
     *  }
     */
    super();
    this.id = id;
    this.data = {};
    const modbus = type.protocols[0];
    this.knownDevices = allDevices[modbus] || [];
    this.deviceType = type;
    this.client = mqtt.connect('mqtt://localhost', {
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
    });
    this.options = options;
  }

  setKnownDevices(knownDevices) {
    this.knownDevices = knownDevices;
  }

  subscribe(callback) {
    return this.client.subscribe('modbus2mqtt/bridge/log', (err) => {
      if (err) {
        return callback(err);
      }
      return callback();
    });
  }

  init() {
    this.on('internalNewDeviceTimeout', () => {
      const payload = {
        status: {
          eventType: 'not_paired',
        },
        deviceId: this.id,
      };
      this.emit('timeoutDiscovering', payload);
    });

    this.on('internalNewDevice', (newDevice) => {
      this.client.removeAllListeners('message');
      this.client.unsubscribe('modbus2mqtt/bridge/log');
      this.emit('newDevice', newDevice);
      this.start(newDevice);
    });

    this.client.on('connect', () => {
      debug('Connected');
      async.waterfall([
        this.subscribe.bind(this),
        findDevices.bind(this),
      ]);
    });
  }

  start(device) {
    const { ieeeAddr } = device;
    const topic = `modbus2mqtt/${ieeeAddr}`;
    this.client.on('message', (topic, message) => {
      const parsed = JSON.parse(message.toString());
      this.emit('data', parsed);
    });
    if (this.deviceType.type === 'sensor') {
      this.client.subscribe(topic);
    }
  }

  stop() { }

  control(message, action) { }

  remove() {
    const device = this.knownDevices.filter((modbusDevice) => {
      return modbusDevice.id === this.id;
    })[0];
    const friendlyName = _.get(device, 'ieeeAddr');

    this.subscribe((err) => {
      this.client.on('message', (topic, message) => {
        if (topic !== 'modbus2mqtt/bridge/log') {
          return;
        }
        const logMessage = JSON.parse(message.toString());
        const messageType = logMessage.type;
        if (messageType !== 'device_force_removed') {
          return;
        }
        const friendlyNameRemoved = logMessage.message;
        if (friendlyNameRemoved === friendlyName) {
          this.emit('deviceRemoved', this.id);
          this.removeAllListeners();
          this.client.end();
        }
      });
    });
    const topic = 'modbus2mqtt/bridge/config/force_remove';
    this.client.publish(topic, friendlyName);
  }
}

module.exports = GateAddOnModbus;
