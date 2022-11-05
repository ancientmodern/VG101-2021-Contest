define("lazy", ["jquery", "event", "algorithm"], function($, EventEmitter, {PriorityQueue}) {
    window.$ = window.jQuery = $;

    function getTop(obj){
        var h = 0;
        while(obj){
            h += obj.offsetTop;
            obj = obj.offsetParent;
        }
        return h;
    }

    function imgCompare(img1, img2) {
        if($(img1).is(":hidden") && !$(img2).is(":hidden")) return false;
        if(!$(img1).is(":hidden") && $(img2).is(":hidden")) return true;
        return getTop($(img1)[0]) < getTop($(img2)[0]);
    }

    var imgQueue = new PriorityQueue();

    function lazyLoad() {
        $("img").each(function() {
            imgQueue.enqueue($(this), imgCompare);
            $(this).attr("data-src",$(this).attr("src")).attr("src", "");
        });
        console.log(imgQueue);
        function load() {
            if(imgQueue.queue.length === 0) return;
            var img = imgQueue.dequeue();
            img.attr("src", img.attr("data-src"));
            img.on("load", load);
        }
        load();
    }

    //lazyLoad();
});