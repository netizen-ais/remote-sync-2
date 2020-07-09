/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let minimatch = null;
let async = null;


module.exports = {
  run(logger, transport, path, targetPath, callback) {
    if (!minimatch) { minimatch = require("minimatch"); }
    if (!async) { async = require("async"); }

    logger.log(`Downloading all files: ${path}`);

    return transport.fetchFileTree(path, function(err, files) {
      if (err) { return logger.error(err); }

      return async.mapSeries(files, (file, callback) => transport.download(file, targetPath, callback)
      , function(err) {
        if (err) { return logger.error; }
        if (err) { return logger.error(err); }
        logger.log(`Downloaded all files: ${path}`);
        return (typeof callback === 'function' ? callback() : undefined);
      });
    });
  }
};
