/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let Host;
const fs = require('fs-plus');
const {
  EventEmitter
} = require("events");

module.exports =
(Host = class Host {
  constructor(configPath, emitter) {
    this.configPath = configPath;
    this.emitter = emitter;
    if (!fs.existsSync(this.configPath)) { return; }
    try {
      const data = fs.readFileSync(this.configPath, "utf8");
      const settings = JSON.parse(data);
      for (let k in settings) {
        const v = settings[k];
        this[k] = v;
      }
    } catch (err) {
      console.log(`load ${this.configPath}, ${err}`);
    }

    if (this.port == null) {this.port = ""; }
    this.port = this.port.toString();
    if (this.ignore) { this.ignore = this.ignore.join(", "); }
    if (this.watch) { this.watch  = this.watch.join(", "); }
  }

  saveJSON() {
    let val;
    const {
      configPath
    } = this;
    const {
      emitter
    } = this;

    this.configPath = undefined;
    this.emitter = undefined;

    if (this.ignore == null) {this.ignore = ".remote-sync.json,.git/**"; }
    this.ignore = this.ignore.split(',');
    this.ignore = ((() => {
      const result = [];
      for (val of Array.from(this.ignore)) {         if (val) {
          result.push(val.trim());
        }
      }
      return result;
    })());

    if (this.watch == null) {  this.watch = ""; }
    this.watch   = this.watch.split(',');
    this.watch   = ((() => {
      const result1 = [];
      for (val of Array.from(this.watch)) {         if (val) {
          result1.push(val.trim());
        }
      }
      return result1;
    })());

    if (this.transport == null) {this.transport ="scp"; }

    return fs.writeFile(configPath, JSON.stringify(this, null, 2), function(err) {
      if (err) {
        return console.log(`Failed saving file ${configPath}`);
      } else {
        return emitter.emit('configured');
      }
    });
  }
});
