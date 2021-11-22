(function (getExt) {
    if(window.define) define("jqExt", ["jquery"], function($) { getExt($); });
    if(window.$) getExt(window.$);
})(function($) {
    $.file = function(path, {id, source, data = {}}, cb) {
        var fd = new FormData();
        fd.append(id, $(source)[0].files[0]);
        for(var key in data) {
            if(data.hasOwnProperty(key))
                fd.append(key, data[key]);
        }
        $.ajax({
                url: path,
                type: "post",
                data: fd,
                contentType: false,
                processData: false,
                success: function(res) {
                    cb(res);
                }
            }
        )
    };

    $.fn.setSuccessStatus = function() {
        var element = $(this).removeClass("fail").addClass("success");
        setTimeout(function() {
            element.removeClass("success");
        }, 1000)
    };

    $.fn.setFailStatus = function() {
        var element = $(this).removeClass("success").addClass("fail");
        setTimeout(function() {
            element.removeClass("fail");
        }, 1000)
    };

    function allowDrop(ev)
    {
        ev.preventDefault();
    }

    function drag(ev)
    {
        ev.dataTransfer.setData("Text",ev.target.id);
    }

    function drop(ev)
    {
        ev.preventDefault();
        var data=ev.dataTransfer.getData("Text");
        ev.target.appendChild(document.getElementById(data));
    }

    $.fn.allowDrag = function() {
        $(this).attr({draggable: true}).on("dragstart", drag);
    };

    var _el;

    function dragOver(e) {
        try {
            if (isBefore(_el, e.target))
                e.target.parentNode.insertBefore(_el, e.target);
            else
                e.target.parentNode.insertBefore(_el, e.target.nextSibling);
        } catch(DOMException) {
            return false;
        }
    }

    function dragStart(e) {
        this.dragging = true;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", null); // Thanks to bqlou for their comment.
        _el = e.target;
    }

    function isBefore(el1, el2) {
        if (el2.parentNode === el1.parentNode)
            for (var cur = el1.previousSibling; cur && cur.nodeType !== 9; cur = cur.previousSibling)
                if (cur === el2)
                    return true;
        return false;
    }

    $.fn.sortable = function(cb) {
        var element = $(this), base = this;
        element.children().each(function() {
            var node = $(this).attr({draggable: true});
            node[0].ondragstart = dragStart;
            node[0].ondragover = function() {
                dragOver.apply(this, arguments);
                cb.apply(base, arguments);
            };
            node.children().each(function() {
                $(this)[0].ondragover = function() {};
            })
        });
    }
});