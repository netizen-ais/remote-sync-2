/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let ScpTransport;
let SSHConnection = null;
let mkdirp = null;
let fs = null;
const path = require("path");

module.exports =
(ScpTransport = class ScpTransport {
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
      return callback(err);
    };

    return this._getConnection((err, c) => {
      if (err) { return errorHandler(err); }

      const end = this.logger.log(`Remote delete: ${targetFilePath} ...`);

      return c.sftp(function(err, sftp) {
        if (err) { return errorHandler(err); }

        return c.exec(`rm -rf \"${targetFilePath}\"`, function(err) {
          if (err) { return errorHandler(err); }

          end();
          sftp.end();
          return callback();
        });
      });
    });
  }

  upload(localFilePath, callback) {
    if (!fs) { fs = require("fs"); }

    if (!fs.existsSync(localFilePath)) {
      callback();
      return false;
    }

    const targetFilePath = path.join(this.settings.target,
                          path.relative(fs.realpathSync(this.projectPath), fs.realpathSync(localFilePath)))
                          .replace(/\\/g, "/");

    const errorHandler = err => {
      this.logger.error(err);
      return callback(err);
    };

    return this._getConnection((err, c) => {
      if (err) { return errorHandler(err); }

      const end = this.logger.log(`Upload: ${localFilePath} to ${targetFilePath} ...`);

      return c.exec(`mkdir -p \"${path.dirname(targetFilePath)}\"`, err => {
        if (err) { return errorHandler(err); }

        return c.sftp((err, sftp) => {
          if (err) { return errorHandler(err); }


          const uploadFilePath = this.settings.useAtomicWrites ? `${targetFilePath}.temp` : `${targetFilePath}`;

          return sftp.fastPut(localFilePath, uploadFilePath, err => {
            if (err) { return errorHandler(err); }

            sftp.end();

            if (this.settings.useAtomicWrites) {
              return c.exec(`cp \"${uploadFilePath}\" \"${targetFilePath}\"; rm \"${uploadFilePath}\"`, function(err) {
                if (err) { return errorHandler(err); }
                end();
                return callback();
              });
            } else {
              end();
              return callback();
            }
          });
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

      return c.sftp(function(err, sftp) {
        if (err) { return errorHandler(err); }
        if (!mkdirp) { mkdirp = require("mkdirp"); }
        return mkdirp(path.dirname(localFilePath)).then(() => {
            return sftp.fastGet(targetFilePath, localFilePath, function(err) {
              if (err) { return errorHandler(err); }

              end();

              sftp.end();
              return (typeof callback === 'function' ? callback() : undefined);
            });
        }).catch(errorHandler);
      });
    });
  }

  fetchFileTree(localPath, callback) {
    const {target, isIgnore} = this.settings;

    const targetPath = path.join(target,
                          path.relative(this.projectPath, localPath))
                          .replace(/\\/g, "/");


    return this._getConnection(function(err, c) {
      if (err) { return callback(err); }

      return c.exec(`find \"${targetPath}\" -type f`, function(err, result) {
        if (err) { return callback(err); }

        let buf = "";
        result.on("data", data => buf += data.toString());
        return result.on("end", function() {
          const files = buf.split("\n").filter(f => f && !isIgnore(f, target));

          return callback(null, files);
        });
      });
    });
  }

  _getConnection(callback) {
    let privateKey;
    const {hostname, port, username, password, keyfile, useAgent, passphrase, readyTimeout} = this.settings;

    if (this.connection) {
      return callback(null, this.connection);
    }

    this.logger.log(`Connecting: ${username}@${hostname}:${port}`);

    if (!SSHConnection) { SSHConnection = require("ssh2"); }

    const connection = new SSHConnection;
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

    if (keyfile) {
      if (!fs) { fs = require("fs"); }
      try {
        privateKey = fs.readFileSync(keyfile);
      } catch (error) {
        const err = error;
        callback(err);
        return false;
      }
    } else {
      privateKey = null;
    }

    const agent = (() => { switch (false) {
      case useAgent !== true:
        if (/windows/i.test(process.env['OS'])) {
          return process.env['SSH_AUTH_SOCK'] || "pageant";
        } else {
          return process.env['SSH_AUTH_SOCK'] || null;
        }
      case typeof useAgent !== "string":
        return useAgent;
      default:
        return null;
    } })();

    connection.connect({
      host: hostname,
      port,
      username,
      password,
      privateKey,
      passphrase,
      readyTimeout,
      agent
    });

    return this.connection = connection;
  }
});
