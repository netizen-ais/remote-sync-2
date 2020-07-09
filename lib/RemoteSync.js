/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const path = require("path");
const fs = require("fs-plus");
const chokidar = require("chokidar");
const randomize = require("randomatic");

let exec = null;
let minimatch = null;

let ScpTransport = null;
let FtpTransport = null;

let uploadCmd = null;
let DownloadCmd = null;
let Host = null;

let HostView = null;
let EventEmitter = null;

const MonitoredFiles = [];
let watchFiles     = {};
let watchChangeSet = false;
const watcher        = chokidar.watch();


let logger = null;
const getLogger = function() {
  if (!logger) {
    const Logger = require("./Logger");
    logger = new Logger("Remote Sync PRO");
  }
  return logger;
};

class RemoteSync {
  constructor(projectPath, configPath) {
    this.projectPath = projectPath;
    this.configPath = configPath;
    if (Host == null) { Host = require('./model/host'); }

    this.host = new Host(this.configPath);
    watchFiles = this.host.watch != null ? this.host.watch.split(",").filter(Boolean) : undefined;
    if (this.host.source) { this.projectPath = path.join(this.projectPath, this.host.source); }
    if (watchFiles != null) {
      this.initAutoFileWatch(this.projectPath);
    }
    this.initIgnore(this.host);
    this.initMonitor();
  }

  initIgnore(host){
    const ignore = host.ignore != null ? host.ignore.split(",") : undefined;
    return host.isIgnore = (filePath, relativizePath) => {
      if (!relativizePath && !this.inPath(this.projectPath, filePath)) { return true; }
      if (!ignore) { return false; }

      if (!relativizePath) { relativizePath = this.projectPath; }
      filePath = path.relative(relativizePath, filePath);

      if (minimatch == null) { minimatch = require("minimatch"); }
      for (let pattern of Array.from(ignore)) {
        if (minimatch(filePath, pattern, { matchBase: true, dot: true })) { return true; }
      }
      return false;
    };
  }

  isIgnore(filePath, relativizePath){
    return this.host.isIgnore(filePath, relativizePath);
  }

  inPath(rootPath, localPath){
    if (fs.isDirectorySync(localPath)) { localPath = localPath + path.sep; }
    return localPath.indexOf(rootPath + path.sep) === 0;
  }

  dispose() {
    if (this.transport) {
      this.transport.dispose();
      return this.transport = null;
    }
  }

  deleteFile(filePath) {
    if (this.isIgnore(filePath)) { return; }

    if (!uploadCmd) {
      const UploadListener = require("./UploadListener");
      uploadCmd = new UploadListener(getLogger());
    }

    uploadCmd.handleDelete(filePath, this.getTransport());
    for (let t of Array.from(this.getUploadMirrors())) {
      uploadCmd.handleDelete(filePath, t);
    }

    if (this.host.deleteLocal) {
      return fs.removeSync(filePath);
    }
  }

  downloadFolder(localPath, targetPath, callback){
    if (DownloadCmd == null) { DownloadCmd = require('./commands/DownloadAllCommand'); }
    return DownloadCmd.run(getLogger(), this.getTransport(),
                                localPath, targetPath, callback);
  }

  downloadFile(localPath){
    if (this.isIgnore(localPath)) { return; }
    let realPath = path.relative(this.projectPath, localPath);
    realPath = path.join(this.host.target, realPath).replace(/\\/g, "/");
    return this.getTransport().download(realPath);
  }

  uploadFile(filePath) {
    if (this.isIgnore(filePath)) { return; }

    if (!uploadCmd) {
      const UploadListener = require("./UploadListener");
      uploadCmd = new UploadListener(getLogger());
    }

    if (this.host.saveOnUpload) {
      for (let e of Array.from(atom.workspace.getTextEditors())) {
        if ((e.getPath() === filePath) && e.isModified()) {
          e.save();
          if (this.host.uploadOnSave) { return; }
        }
      }
    }

    uploadCmd.handleSave(filePath, this.getTransport());
    return Array.from(this.getUploadMirrors()).map((t) =>
      uploadCmd.handleSave(filePath, t));
  }

  uploadFolder(dirPath){
    return fs.traverseTree(dirPath, this.uploadFile.bind(this), () => {
      return !this.isIgnore(dirPath);
    }
    , (function() {}));
  }

  initMonitor(){
    const _this = this;
    return setTimeout(function() {
      const MutationObserver = window.MutationObserver || window.WebKitMutationObserver;
      const observer = new MutationObserver(function(mutations, observer) {
        _this.monitorStyles();
      });

      const targetObject = document.querySelector('.tree-view');
      if (targetObject !== null) {
        return observer.observe(targetObject, {
          subtree: true,
          attributes: false,
          childList: true
        }
        );
      }
    }
    , 250);
  }

  monitorFile(dirPath, toggle, notifications){
    if (toggle == null) { toggle = true; }
    if (notifications == null) { notifications = true; }
    if (!this.fileExists(dirPath) && !this.isDirectory(dirPath)) { return; }

    const fileName = this.monitorFileName(dirPath);
    if (!Array.from(MonitoredFiles).includes(dirPath)) {
      MonitoredFiles.push(dirPath);
      watcher.add(dirPath);
      if (notifications) {
        atom.notifications.addInfo("remote-sync: Watching file - *"+fileName+"*");
      }

      if (!watchChangeSet) {
        const _this = this;
        watcher.on('change', path => _this.uploadFile(path));
        watcher.on('unlink', path => _this.deleteFile(path));
        watchChangeSet = true;
      }
    } else if (toggle) {
      watcher.unwatch(dirPath);
      const index = MonitoredFiles.indexOf(dirPath);
      MonitoredFiles.splice(index, 1);
      if (notifications) {
        atom.notifications.addInfo("remote-sync: Unwatching file - *"+fileName+"*");
      }
    }
    return this.monitorStyles();
  }

  monitorStyles(){
    const monitorClass  = 'file-monitoring';
    const pulseClass    = 'pulse';
    const monitored     = document.querySelectorAll('.'+monitorClass);

    if ((monitored !== null) && (monitored.length !== 0)) {
      for (let item of Array.from(monitored)) {
        item.classList.remove(monitorClass);
      }
    }

    return (() => {
      const result = [];
      for (let file of Array.from(MonitoredFiles)) {
        let file_name = file.replace(/(['"])/g, "\\$1");
        file_name = file.replace(/\\/g, '\\\\');
        const icon_file = document.querySelector('[data-path="'+file_name+'"]');
        if (icon_file !== null) {
          const list_item = icon_file.parentNode;
          list_item.classList.add(monitorClass);
          if (atom.config.get("remote-sync-2.monitorFileAnimation")) {
            result.push(list_item.classList.add(pulseClass));
          } else {
            result.push(undefined);
          }
        } else {
          result.push(undefined);
        }
      }
      return result;
    })();
  }

  monitorFilesList(){
    let files        = "";
    const watchedPaths = watcher.getWatched();
    for (let k in watchedPaths) {
      const v = watchedPaths[k];
      for (let file of Array.from(watchedPaths[k])) {
        files += file+"<br/>";
      }
    }
    if (files !== "") {
      return atom.notifications.addInfo("remote-sync: Currently watching:<br/>*"+files+"*");
    } else {
      return atom.notifications.addWarning("remote-sync: Currently not watching any files");
    }
  }

  fileExists(dirPath) {
    const file_name = this.monitorFileName(dirPath);
    try {
      const exists = fs.statSync(dirPath);
      return true;
    } catch (e) {
      atom.notifications.addWarning("remote-sync: cannot find *"+file_name+"* to watch");
      return false;
    }
  }

  isDirectory(dirPath) {
    let directory;
    if (directory = fs.statSync(dirPath).isDirectory()) {
      atom.notifications.addWarning("remote-sync: cannot watch directory - *"+dirPath+"*");
      return false;
    }

    return true;
  }

  monitorFileName(dirPath){
    const file = dirPath.split('\\').pop().split('/').pop();
    return file;
  }

  initAutoFileWatch(projectPath) {
    const _this = this;
    if (watchFiles.length !== 0) {
      for (let filesName of Array.from(watchFiles)) { _this.setupAutoFileWatch(filesName,projectPath); }
      setTimeout(() => _this.monitorFilesList()
      , 1500);
      return;
    }
  }

  setupAutoFileWatch(filesName,projectPath) {
    const _this = this;
    return setTimeout(function() {
      if (process.platform === "win32") {
        filesName = filesName.replace(/\//g, '\\');
      }
      const fullpath = projectPath + filesName.replace(/^\s+|\s+$/g, "");
      return _this.monitorFile(fullpath,false,false);
    }
    , 250);
  }


  uploadGitChange(dirPath){
    const repos = atom.project.getRepositories();
    let curRepo = null;
    for (let repo of Array.from(repos)) {
      if (!repo) { continue; }
      const workingDirectory = repo.getWorkingDirectory();
      if (this.inPath(workingDirectory, this.projectPath)) {
        curRepo = repo;
        break;
      }
    }
    if (!curRepo) { return; }

    const isChangedPath = function(path){
      const status = curRepo.getCachedPathStatus(path);
      return curRepo.isStatusModified(status) || curRepo.isStatusNew(status);
    };

    return fs.traverseTree(dirPath, path=> {
      if (isChangedPath(path)) { return this.uploadFile(path); }
    }
    , path => {
      return !this.isIgnore(path);
    }
    , (function() {}));
  }

  createTransport(host){
    let Transport;
    if ((host.transport === 'scp') || (host.transport === 'sftp')) {
      if (ScpTransport == null) { ScpTransport = require("./transports/ScpTransport"); }
      Transport = ScpTransport;
    } else if (host.transport === 'ftp') {
      if (FtpTransport == null) { FtpTransport = require("./transports/FtpTransport"); }
      Transport = FtpTransport;
    } else {
      throw new Error("[remote-sync] invalid transport: " + host.transport + " in " + this.configPath);
    }

    return new Transport(getLogger(), host, this.projectPath);
  }

  getTransport() {
    if (this.transport) { return this.transport; }
    this.transport = this.createTransport(this.host);
    return this.transport;
  }

  getUploadMirrors() {
    if (this.mirrorTransports) { return this.mirrorTransports; }
    this.mirrorTransports = [];
    if (this.host.uploadMirrors) {
      for (let host of Array.from(this.host.uploadMirrors)) {
        this.initIgnore(host);
        this.mirrorTransports.push(this.createTransport(host));
      }
    }
    return this.mirrorTransports;
  }

  diffFile(localPath){
    let os;
    let realPath = path.relative(this.projectPath, localPath);
    realPath = path.join(this.host.target, realPath).replace(/\\/g, "/");

    if (!os) { os = require("os"); }
    const targetPath = path.join(os.tmpDir(), "remote-sync", randomize('A0', 16));

    return this.getTransport().download(realPath, targetPath, () => {
      return this.diff(localPath, targetPath);
    });
  }

  diffFolder(localPath){
    let os;
    if (!os) { os = require("os"); }
    const targetPath = path.join(os.tmpDir(), "remote-sync", randomize('A0', 16));
    return this.downloadFolder(localPath, targetPath, () => {
      return this.diff(localPath, targetPath);
    });
  }

  diff(localPath, targetPath) {
    if (this.isIgnore(localPath)) { return; }
    targetPath = path.join(targetPath, path.relative(this.projectPath, localPath));
    if (fs.md5ForPath(localPath) === fs.md5ForPath(targetPath)) {
      atom.notifications.addSuccess('Files are synced', {icon: 'diff'});
      return;
    }
    const diffCmd = atom.config.get('remote-sync-2.difftoolCommand');
    if (exec == null) { ({
      exec
    } = require("child_process")); }
    return exec(`\"${diffCmd}\" \"${localPath}\" \"${targetPath}\"`, function(err){
      if (!err) { return; }
      return getLogger().error(`Check [difftool Command] in your settings (remote-sync).
Command error: ${err}
command: ${diffCmd} ${localPath} ${targetPath}\
`
      );
    });
  }
}

module.exports = {
  create(projectPath){
    const configPath = path.join(projectPath, atom.config.get('remote-sync-2.configFileName'));
    if (!fs.existsSync(configPath)) { return; }
    return new RemoteSync(projectPath, configPath);
  },

  configure(projectPath, callback){
    if (HostView == null) { HostView = require('./view/host-view'); }
    if (Host == null) { Host = require('./model/host'); }
    if (EventEmitter == null) { ({
      EventEmitter
    } = require("events")); }

    const emitter = new EventEmitter();
    emitter.on("configured", callback);

    const configPath = path.join(projectPath, atom.config.get('remote-sync-2.configFileName'));
    const host = new Host(configPath, emitter);
    const view = new HostView(host);
    return view.attach();
  }
};
