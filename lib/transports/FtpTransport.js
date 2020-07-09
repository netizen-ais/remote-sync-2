/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let FtpTransport;
const FTPConnection = null;
let mkdirp = null;
let fs = null;
const path = require("path");

module.exports =
(FtpTransport = class FtpTransport {
  constructor(logger, settings, projectPath) {
    this.logger = logger;
    this.settings = settings;
    this.projectPath = projectPath;
  }

  dispose() {
    if (this.connection) {
      this.connection.end();
      return this.connection = null;
    }
  }

  delete(localFilePath, callback) {
    const targetFilePath = path.join(this.settings.target,
                                path.relative(this.projectPath, localFilePath))
                                .replace(/\\/g, "/");

    const errorHandler = err => {
      this.logger.error(err);
      return callback();
    };

    return this._getConnection((err, c) => {
      if (err) { return errorHandler(err); }

      const end = this.logger.log(`Remote delete: ${targetFilePath} ...`);

      return c.delete(targetFilePath, function(err) {
        if (err) { return errorHandler(err); }

        end();

        return callback();
      });
    });
  }

  upload(localFilePath, callback) {
    const targetFilePath = path.join(this.settings.target,
                                path.relative(this.projectPath, localFilePath))
                                .replace(/\\/g, "/");

    const errorHandler = err => {
      this.logger.error(err);
      return callback();
    };

    return this._getConnection((err, c) => {
      if (err) { return errorHandler(err); }

      const end = this.logger.log(`Upload: ${localFilePath} to ${targetFilePath} ...`);
      const mpath = path.dirname(targetFilePath);

      return c.mkdir(mpath, true, function(err) {
        if (err && (mpath !== "/")) { return errorHandler(err); }

        return c.put(localFilePath, targetFilePath, function(err) {
          if (err) { return errorHandler(err); }

          end();

          return callback();
        });
      });
    });
  }

  download(targetFilePath, localFilePath, callback) {
    if (!localFilePath) {
      localFilePath = this.projectPath;
    }

    localFilePath = path.resolve(localFilePath,
                                path.relative(this.settings.target, targetFilePath));

    const errorHandler = err => {
      return this.logger.error(err);
    };

    return this._getConnection((err, c) => {
      if (err) { return errorHandler(err); }

      const end = this.logger.log(`Download: ${targetFilePath} to ${localFilePath} ...`);

      if (!mkdirp) { mkdirp = require("mkdirp"); }
      return mkdirp(path.dirname(localFilePath)).then(() => {
          return c.get(targetFilePath, function(err, readableStream) {
              if (err) { return errorHandler(err); }

              if (!fs) { fs = require("fs-plus"); }
              const writableStream = fs.createWriteStream(localFilePath);
              writableStream.on("unpipe", function() {
                  end();
                  return (typeof callback === 'function' ? callback() : undefined);
              });
              return readableStream.pipe(writableStream);
          });
      }).catch(errorHandler);
    });
  }

  fetchFileTree(localPath, callback) {
    const targetPath = path.join(this.settings.target,
                          path.relative(this.projectPath, localPath))
                          .replace(/\\/g, "/");
    const {
      isIgnore
    } = this.settings;

    return this._getConnection(function(err, c) {
      if (err) { return callback(err); }

      const files = [];
      let directories = 0;

      var directory = function(dir) {
        directories++;
        return c.list(dir, function(err, list) {
          if (err) { return callback(err); }

          if (list != null) {
            list.forEach(function(item, i) {
            if ((item.type === "-") && !isIgnore(item.name, dir)) { files.push(dir + "/" + item.name); }
            if ((item.type === "d") && ![".", ".."].includes(item.name)) { return directory(dir + "/" + item.name); }});
          }

          directories--;
          if (directories === 0) { return callback(null, files); }
        });
      };

      return directory(targetPath);
    });
  }

  _getConnection(callback) {
    let FtpConnection;
    const {hostname, port, username, password, secure} = this.settings;

    if (this.connection) {
      return callback(null, this.connection);
    }

    this.logger.log(`Connecting: ${username}@${hostname}:${port}`);

    if (!FtpConnection) { FtpConnection = require("ftp"); }

    const connection = new FtpConnection;
    let wasReady = false;

    connection.on("ready", function() {
      wasReady = true;
      return callback(null, connection);
    });

    connection.on("error", err => {
      if (!wasReady) {
        callback(err);
      }
      return this.connection = null;
    });

    connection.on("end", () => {
      return this.connection = null;
    });

    connection.connect({
      host: hostname,
      port,
      user: username,
      password,
      secure
    });

    return this.connection = connection;
  }
});
