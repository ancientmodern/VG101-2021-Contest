define("richeditor", ["jquery", "event", "promise", "promisify"], function($, EventEmitter, Promise, promisify) {
    function ControlPanel() {
        this._panel = $("<div class='re_control'>CP</div>");
        this._panel.appendTo(this.container);
    }

    function EditArea() {
        this._edit = $("<div class='re_edit' contenteditable='true'></div>");
        this._edit.appendTo(this.container);

        // Register Functions

        this.enterTab = function() {
            var sel = document.getSelection();
            var range = sel.getRangeAt(0);
            var element = range.commonAncestorContainer;
            console.log(sel);
            if(sel.anchorOffset === sel.baseOffset) { // No selection
                var origin = this._edit.html();
                this._edit.html(
                    origin.substr(0, sel.anchorOffset) +
                    "&nbsp;&nbsp;&nbsp;" +
                    origin.substr(sel.anchorOffset, origin.length)
                );
            } else {

            }
        };

        var editor = this;

        this._edit.on("keydown", function(e) {
            if(e.key === "Tab") {
                e.preventDefault();
                editor.enterTab();
            }
        });

        this._edit.on("keyup", function() {
            editor.emit("change");
        });

        this.before("change", function() {
            editor._value = editor._edit.html();
        })
    }

    EditArea.prototype.setHTML = function(html) {
        this._edit.html(html);
        this.emit("change");
    };

    function RichEditor(e) {
        this.textarea = $(e);
        this.container = this.textarea.parent();
        this.controlPanel = ControlPanel.call(this);
        this.editArea = EditArea.call(this);
        this.textarea.hide();
        this._value = "";

        var editor = this;

        this.on("change", function () {
            editor.textarea.val(this._value);
        });

        this.val = function (b) {
            if (!b) return this._value;
            this._value = b;
            this.editArea.setHTML(b);
            this.emit("change");
        };
    }

    RichEditor.prototype = new EventEmitter;

    (function init() {
        var head = document.getElementsByTagName('head')[0];
        var link = document.createElement('link');
        link.href = "/css/richEditor.css";
        link.rel = 'stylesheet';
        link.type = 'text/css';
        head.appendChild(link)
    })();

    return function(e) {
        return new RichEditor(e);
    }
});
