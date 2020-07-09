/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

let UploadListener;
const minimatch = null;
let async = null;

module.exports =
(UploadListener = class UploadListener {
  handleSave(localFilePath, transport) {
    return this.handleAction(localFilePath, transport, 'upload');
  }

  handleDelete(localFilePath, transport) {
    return this.handleAction(localFilePath, transport, 'delete');
  }

  handleAction(localFilePath, transport, action) {
    if (!this.queue) {
      if (!async) { async = require("async"); }
      this.queue = async.queue(this.processFile.bind(this), 1);
    }


    if (this.queue.length()) {
      let task = this.queue._tasks.head;
      while (task) {
       if ((task.data.localFilePath === localFilePath) && (task.data.action === action) && (task.data.transport.settings.transport === transport.settings.transport) && (task.data.transport.settings.hostname === transport.settings.hostname) && (task.data.transport.settings.port === transport.settings.port) && (task.data.transport.settings.target === transport.settings.target)) {
         task.data.discard = true;
        }
       task = task.next;
      }
    }

    this.queue.resume();

    return this.queue.push({
      localFilePath,
      transport,
      action,
      discard: false
    });
  }

  processFile(task, callback) {
    const {localFilePath, transport, action, discard} = task;

    const cb = err => {
      if (err) {
        this.queue.pause();
        this.queue.unshift(task);
      }
      return callback(err);
    };

    if (discard) {
      callback();
      return;
    }

    if (action === 'upload') {
      return transport.upload(localFilePath, cb);
    } else {
      return transport.delete(localFilePath, cb);
    }
  }
});
