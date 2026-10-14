require('dotenv').config();
const mongoose = require('mongoose');
const { provider, isSqlProvider } = require('./config');
const name = provider();
const runtime = require('./runtime');
const sql = isSqlProvider(name);
const overrides = sql ? {
  connection: runtime.connection,
  connect: () => runtime.connect(), disconnect: runtime.disconnect,
  startSession: async () => new runtime.Session()
} : {};
module.exports = new Proxy(mongoose, {
  get(target, key) {
    if (key === 'providerName') return name;
    if (key === 'isSqlProvider') return sql;
    if (key === 'bindModel') return model => sql ? require('./models').bindModel(model) : model;
    if (Object.hasOwn(overrides, key)) return overrides[key];
    return Reflect.get(target, key);
  }
});
