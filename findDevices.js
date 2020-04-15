const debug = require('debug')('gate-addon-modbus');

module.exports = function findDevices(callback) {
  const timeoutId = setTimeout(() => {
    debug('Internal new device timeout');
    this.emit('internalNewDeviceTimeout');
  }, 30000);

  this.client.on('message', (topic, message) => {
    if (topic !== 'modbus2mqtt/bridge/log') {
      return;
    }
    debug('On message');
    debug(message.toString());

    const logMessage = JSON.parse(message.toString());
    const messageType = logMessage.type;
    if (messageType !== 'device_connected') {
      return;
    }
    const ieeeAddr = logMessage.message.friendly_name;
    const newDevice = {
      parameters: this.options,
      ieeeAddr,
      protocol: 'modbus',
    };
    clearTimeout(timeoutId);
    this.emit('internalNewDevice', newDevice);
  });
  const topic = 'modbus2mqtt/configure/set';
  const payload = {
    ...this.options,
    model: this.deviceType.model,
    id: this.id,
  };
  this.client.publish(topic, JSON.stringify(payload));
  return callback();
};
