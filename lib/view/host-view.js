/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let ConfigView;
const {$, View, TextEditorView} = require('atom-space-pen-views');
const {CompositeDisposable} = require('atom');

module.exports =
(ConfigView = (function() {
  ConfigView = class ConfigView extends View {
    static initClass() {
      this.prototype.panel = null;
    }

    static content() {
      return this.div({class: 'remote-sync'}, () => {
        this.div({class:'block'}, () => {
          return this.div({class: 'btn-group', outlet: 'transportGroup'}, () => {
            this.button({class: 'btn  selected', targetBlock: 'authenticationButtonsBlock'}, 'SCP/SFTP');
            return this.button({class: 'btn', targetBlock:'ftpPasswordBlock'}, 'FTP');
          });
        });

        this.label('Hostname');
        this.subview('hostname', new TextEditorView({mini: true}));

        this.label('Port');
        this.subview('port', new TextEditorView({mini: true}));

        this.label('Target directory');
        this.subview('target', new TextEditorView({mini: true}));

        this.label('Ignore Paths');
        this.subview('ignore', new TextEditorView({mini: true, placeholderText: "Default: .remote-sync.json, .git/**"}));

        this.label('Username');
        this.subview('username', new TextEditorView({mini: true}));

        this.div({class: 'block', outlet: 'authenticationButtonsBlock'}, () => {
          this.div({class: 'btn-group'}, () => {
            this.a({class: 'btn  selected', targetBlock: 'privateKeyBlock'}, 'privatekey');
            this.a({class: 'btn', targetBlock: 'passwordBlock'}, 'password');
            return this.a({class: 'btn', outlet: 'userAgentButton'}, 'useAgent');
          });

          this.div({class: 'block', outlet: 'privateKeyBlock'}, () => {
            this.label('Keyfile path');
            this.subview('privateKeyPath', new TextEditorView({mini: true}));
            this.label('Passphrase');
            return this.subview('privateKeyPassphrase', new TextEditorView({mini: true, placeholderText: "leave blank if private key is unencrypted"}));
          });

          return this.div({class: 'block', outlet: 'passwordBlock', style: 'display:none'}, () => {
            this.label('Password');
            return this.subview('password', new TextEditorView({mini: true}));
          });
        });

        this.div({class: 'block', outlet: 'ftpPasswordBlock', style: 'display:none'}, () => {
          return this.label('Password');
        });

        this.label('Watch automatically');
        this.subview('watch', new TextEditorView({mini: true, placeholderText: "Files that will be automatically watched on project open"}));

        this.div(() => {
          return this.label(" uploadOnSave", () => {
            return this.input({type: 'checkbox', outlet: 'uploadOnSave'});
          });
        });

        this.div(() => {
          return this.label(" useAtomicWrites", () => {
            return this.input({type: 'checkbox', outlet: 'useAtomicWrites'});
          });
        });

        this.label(" Delete local file/folder upon remote delete", () => {
          return this.input({type: 'checkbox', outlet: 'deleteLocal'});
        });

        return this.div({class: 'block pull-right'}, () => {
          this.button({class: 'inline-block-tight btn', outlet: 'cancelButton', click: 'close'}, 'Cancel');
          return this.button({class: 'inline-block-tight btn', outlet: 'saveButton', click: 'confirm'}, 'Save');
        });
      });
    }

    initialize(host) {
      this.host = host;
      this.disposables = new CompositeDisposable;
      this.disposables.add(atom.commands.add('atom-workspace', {
          'core:confirm': () => this.confirm(),
          'core:cancel': event => {
            this.close();
            return event.stopPropagation();
          }
        }
      )
      );

      this.transportGroup.on('click', e=> {
        e.preventDefault();
        const btn = $(e.target);
        let targetBlock = btn.addClass('selected').siblings('.selected').removeClass('selected').attr("targetBlock");
        if (targetBlock) { this[targetBlock].hide(); }

        targetBlock = btn.attr("targetBlock");
        if (targetBlock) { this[targetBlock].show(); }
        this.host.transport = btn.text().split("/")[0].toLowerCase();
        if (this.host.transport === "scp") {
          return this.passwordBlock.append(this.password);
        } else {
          return this.ftpPasswordBlock.append(this.password);
        }
      });

      return $('.btn-group .btn', this.authenticationButtonsBlock).on('click', e=> {
        e.preventDefault();
        let targetBlock = $(e.target).addClass('selected').siblings('.selected').removeClass('selected').attr("targetBlock");
        if (targetBlock) { this[targetBlock].hide(); }

        targetBlock = $(e.target).attr("targetBlock");
        if (targetBlock) { return this[targetBlock].show().find(".editor").first().focus(); }
      });
    }

    attach() {
      if (this.panel == null) { this.panel = atom.workspace.addModalPanel({item: this}); }

      this.find(".editor").each((i, editor)=> {
        const dataName = $(editor).prev().text().split(" ")[0].toLowerCase();
        return $(editor).view().setText(this.host[dataName] || "");
      });

      this.uploadOnSave.prop('checked', this.host.uploadOnSave);
      this.useAtomicWrites.prop('checked', this.host.useAtomicWrites);
      this.deleteLocal.prop('checked', this.host.deleteLocal);
      if (this.host.transport) { $(":contains('"+this.host.transport.toUpperCase()+"')", this.transportGroup).click(); }
      if (this.host.transport === "scp") {
        return $('.btn-group .btn', this.authenticationButtonsBlock).each((i, btn)=> {
          btn = $(btn);
          if (!this.host[btn.text()]) { return; }
          btn.click();
          return false;
        });
      }
    }

    close() {
      this.detach();
      this.panel.destroy();
      this.panel = null;
      return this.disposables.dispose();
    }

    confirm() {
      this.host.uploadOnSave = this.uploadOnSave.prop('checked');
      this.host.useAtomicWrites = this.useAtomicWrites.prop('checked');
      this.host.deleteLocal = this.deleteLocal.prop('checked');
      this.find(".editor").each((i, editor)=> {
        const dataName = $(editor).prev().text().split(" ")[0].toLowerCase();
        const view = $(editor).view();
        let val = view.getText();
        if ((val === "") || view.parent().isHidden() || view.parent().parent().isHidden()) { val = undefined; }
        return this.host[dataName] = val;
      });

      if (((this.host.transport === undefined) || (this.host.transport === "scp")) && this.userAgentButton.hasClass('selected')) {
        this.host.useAgent = true;
      } else {
        this.host.useAgent = undefined;
      }

      this.host.saveJSON();
      return this.close();
    }
  };
  ConfigView.initClass();
  return ConfigView;
})());
