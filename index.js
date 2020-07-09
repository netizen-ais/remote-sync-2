/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const fs = require('fs-plus');

let CompositeDisposable = null;
const path = null;
let $ = null;

const getEventPath = function(e){
  if ($ == null) { ({
    $
  } = require('atom-space-pen-views')); }

  let target = $(e.target).closest('.file, .directory, .tab')[0];
  if (target == null) { target = atom.workspace.getActiveTextEditor(); }

  const fullPath = __guardMethod__(target, 'getPath', o => o.getPath());
  if (!fullPath) { return []; }

  const [projectPath, relativePath] = Array.from(atom.project.relativizePath(fullPath));
  return [projectPath, fullPath];
};

let projectDict = null;
let disposables = null;
let RemoteSync = null;
const initProject = function(projectPaths){
  let projectPath;
  const disposes = [];
  for (projectPath in projectDict) {
    if (projectPaths.indexOf(projectPath) === -1) { disposes.push(projectPath); }
  }

  for (projectPath of Array.from(disposes)) {
    projectDict[projectPath].dispose();
    delete projectDict[projectPath];
  }

  return (() => {
    const result = [];
    for (projectPath of Array.from(projectPaths)) {
      try {
          projectPath = fs.realpathSync(projectPath);
      } catch (err) {
          continue;
        }
      if (projectDict[projectPath]) { continue; }
      if (RemoteSync == null) { RemoteSync = require("./lib/RemoteSync"); }
      const obj = RemoteSync.create(projectPath);
      if (obj) { result.push(projectDict[projectPath] = obj); } else {
        result.push(undefined);
      }
    }
    return result;
  })();
};

const handleEvent = function(e, cmd){
  const [projectPath, fullPath] = Array.from(getEventPath(e));
  if (!projectPath) { return; }

  const projectObj = projectDict[fs.realpathSync(projectPath)];
  return (typeof projectObj[cmd] === 'function' ? projectObj[cmd](fs.realpathSync(fullPath)) : undefined);
};

const reload = function(projectPath){
  if (projectDict[projectPath] != null) {
    projectDict[projectPath].dispose();
  }
  return projectDict[projectPath] = RemoteSync.create(projectPath);
};

const configure = function(e){
  let [projectPath] = Array.from(getEventPath(e));
  if (!projectPath) { return; }

  projectPath = fs.realpathSync(projectPath);
  if (RemoteSync == null) { RemoteSync = require("./lib/RemoteSync"); }
  return RemoteSync.configure(projectPath, () => reload(projectPath));
};

module.exports = {
  config: {
    logToConsole: {
      type: 'boolean',
      default: false,
      title: 'Log to console',
      description: 'Log messages to the console instead of the status view at the bottom of the window'
    },
    logToAtomNotifications: {
      type: 'boolean',
      default: false,
      title: 'Use Atom Notifications',
      description: 'Show log messages using Atom notifications'
    },
    autoHideLogPanel: {
      type: 'boolean',
      default: false,
      title: 'Hide log panel after transferring',
      description: 'Hides the status view at the bottom of the window after the transfer operation is done'
    },
    foldLogPanel: {
      type: 'boolean',
      default: false,
      title: 'Fold log panel by default',
      description: 'Shows only one line in the status view'
    },
    monitorFileAnimation: {
      type: 'boolean',
      default: true,
      title: 'Monitor file animation',
      description: 'Toggles the pulse animation for a monitored file'
    },
    difftoolCommand: {
      type: 'string',
      default: '',
      title: 'Diff tool command',
      description: 'The command to run for your diff tool'
    },
    configFileName: {
      type: 'string',
      default: '.remote-sync.json'
    }
  },

  activate(state) {
    projectDict = {};
    initProject(atom.project.getPaths());

    if (CompositeDisposable == null) { ({
      CompositeDisposable
    } = require('atom')); }
    disposables = new CompositeDisposable;

    disposables.add(atom.commands.add('atom-workspace', {
      'remote-sync2:upload-folder'(e){ return handleEvent(e, "uploadFolder"); },
      'remote-sync2:upload-file'(e){ return handleEvent(e, "uploadFile"); },
      'remote-sync2:delete-file'(e){ return handleEvent(e, "deleteFile"); },
      'remote-sync2:delete-folder'(e){ return handleEvent(e, "deleteFile"); },
      'remote-sync2:download-file'(e){ return handleEvent(e, "downloadFile"); },
      'remote-sync2:download-folder'(e){ return handleEvent(e, "downloadFolder"); },
      'remote-sync2:diff-file'(e){ return handleEvent(e, "diffFile"); },
      'remote-sync2:diff-folder'(e){ return handleEvent(e, "diffFolder"); },
      'remote-sync2:upload-git-change'(e){ return handleEvent(e, "uploadGitChange"); },
      'remote-sync2:monitor-file'(e){ return handleEvent(e, "monitorFile"); },
      'remote-sync2:monitor-files-list'(e){ return handleEvent(e,"monitorFilesList"); },
      'remote-sync2:configure': configure
    })
    );

    disposables.add(atom.project.onDidChangePaths(projectPaths => initProject(projectPaths))
    );

    return disposables.add(atom.workspace.observeTextEditors(function(editor) {
      const onDidSave = editor.onDidSave(function(e) {
        const fullPath = e.path;
        let [projectPath, relativePath] = Array.from(atom.project.relativizePath(fullPath));
        if (!projectPath) { return; }

        projectPath = fs.realpathSync(projectPath);
        let projectObj = projectDict[projectPath];
        if (!projectObj) { return; }

        if (fs.realpathSync(fullPath) === fs.realpathSync(projectObj.configPath)) {
          projectObj = reload(projectPath);
        }

        if (!projectObj.host.uploadOnSave) { return; }
        return projectObj.uploadFile(fs.realpathSync(fullPath));
      });


      var onDidDestroy = editor.onDidDestroy(function() {
        disposables.remove(onDidSave);
        disposables.remove(onDidDestroy);
        onDidDestroy.dispose();
        return onDidSave.dispose();
      });

      disposables.add(onDidSave);
      return disposables.add(onDidDestroy);
    })
    );
  },

  deactivate() {
    disposables.dispose();
    disposables = null;
    for (let projectPath in projectDict) {
      const obj = projectDict[projectPath];
      obj.dispose();
    }
    return projectDict = null;
  }
};

function __guardMethod__(obj, methodName, transform) {
  if (typeof obj !== 'undefined' && obj !== null && typeof obj[methodName] === 'function') {
    return transform(obj, methodName);
  } else {
    return undefined;
  }
}