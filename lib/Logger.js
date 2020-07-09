/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let Logger;
let PlainMessageView = null;
let AutoHideTimer = null;

module.exports =
(Logger = class Logger {
  constructor(title) {
    this.title = title;
  }

  showInPanel(message, className) {
    if (atom.config.get("remote-sync-2.logToAtomNotifications")) {
      if (className === 'text-error') {
        atom.notifications.addError(`${message}`);
      } else {
        atom.notifications.addInfo(`${message}`);
      }
    }

    if (!this.panel) {
      let MessagePanelView;
      ({MessagePanelView, PlainMessageView} = require("atom-message-panel"));
      this.panel = new MessagePanelView({
        title: this.title});
    }

    this.panel.attach();
    const msg = new PlainMessageView({
      message,
      className
    });

    this.panel.add(msg);

    this.panel.setSummary({
      summary: message,
      className
    });

    this.panel.body.scrollTop(1e10);

    if (atom.config.get("remote-sync-2.foldLogPanel") && !this.foldedPanel) {
      this.panel.toggle();
      this.foldedPanel = true;
    }

    return msg;
  }

  log(message) {
    const date = new Date;
    const startTime = date.getTime();
    const notifymessage = `${message}`;
    message = `[${date.toLocaleTimeString()}] ${message}`;
    if (atom.config.get("remote-sync-2.logToAtomNotifications")) {
      atom.notifications.addInfo(`${notifymessage}`);
    }
    if (atom.config.get("remote-sync-2.logToConsole")) {
      console.log(message);
      return () => console.log(`${message} Complete (${Date.now() - startTime}ms)`);
    } else {
      let msg;
      if (AutoHideTimer) {
        clearTimeout(AutoHideTimer);
        AutoHideTimer = null;
      }
      if (!atom.config.get("remote-sync-2.logToAtomNotifications")) {
        msg = this.showInPanel(message, "text-info");
      }
      return ()=> {
          const endMsg = ` Complete (${Date.now() - startTime}ms)`;
          if (atom.config.get("remote-sync-2.logToAtomNotifications")) {
            return atom.notifications.addSuccess(endMsg);
          } else {
            msg.append(endMsg);
            this.panel.setSummary({
              summary: `${message} ${endMsg}`,
              className: "text-info"
            });
            if (atom.config.get("remote-sync-2.autoHideLogPanel")) {
              return AutoHideTimer = setTimeout(this.panel.close.bind(this.panel), 1000);
            }
          }
        };
    }
  }

  error(message) {
    if (atom.config.get("remote-sync-2.logToAtomNotifications")) {
      return atom.notifications.addError(`${message}`);
    } else {
      return this.showInPanel(`${message}`,"text-error");
    }
  }
});
