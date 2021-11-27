define("disp", ["jquery", "promise", "/js/vector", "/js/checkLogin"], function ($, Promise, Vector, check) {
    check().then(function (result) {
        if (result) {
            $("#signin").children().html(result).attr("href", "/profile");
        }
    });

    Promise.all = function (promises) {
        return new Promise(function (res, rej) {
            let cnt = 0;
            for (var i = 0; i < promises.length; i++) promises[i].then(function () {
                cnt++;
                if (cnt === promises.length) res();
            });
        });
    }

    function getURLVariable() {
        var args = window.location.href.split("?")[0];
        var vars = args.split("/");
        if (vars[vars.length - 1] === "disp") return "";
        return vars[vars.length - 1];
    }

    function getGameResult() {
        return new Promise(function (res, rej) {
            $.get("/match/get/" + getURLVariable(), function (result) {
                // console.log(JSON.parse(result));
                res(JSON.parse(result));
            })
        });
    }

    function animateRotation(elt, from, to, time) {
        var obj = $(elt);
        var counter = 1;
        return new Promise(function (res, rej) {
            var timer = setInterval(function () {
                if (10 / time * counter >= 1) {
                    obj.css("transform", "rotate(" + to.toString() + "deg) translate(-50%, -50%)");
                    clearInterval(timer);
                    res();
                } else {
                    obj.css("transform", "rotate(" + ((to - from) * 10 / time * counter + from).toString() + "deg) translate(-50%, -50%)")
                    counter++;
                }
            }, 10);
        });
    }

    function animatePosition(elt, from, to, time) {
        var obj = $(elt);
        var counter = 1;
        return new Promise(function (res, rej) {
            var timer = setInterval(function () {
                if (10 / time * counter >= 1) {
                    obj.css({
                        left: to[0].toString() + "%",
                        top: to[1].toString() + "%"
                    });
                    clearInterval(timer);
                    res();
                } else {
                    obj.css({
                        left: ((to[0] - from[0]) * 10 / time * counter + from[0]).toString() + "%",
                        top: ((to[1] - from[1]) * 10 / time * counter + from[1]).toString() + "%"
                    });
                    counter++;
                }
            }, 10);
        });
    }

    function animateBorder(elt, from, to, time) {
        var obj = $(elt);
        var counter = 1;
        return new Promise(function (res, rej) {
            var timer = setInterval(function () {
                if (10 / time * counter >= 1) {
                    obj.css({
                        width: (to + 5).toString() + "%",
                        height: (to + 5).toString() + "%"
                    });
                    clearInterval(timer);
                    res();
                } else {
                    obj.css({
                        width: ((to - from) * 10 / time * counter + from + 5).toString() + "%",
                        height: ((to - from) * 10 / time * counter + from + 5).toString() + "%"
                    });
                    counter++;
                }
            }, 10);
        });
    }

    function animateLife(elt, tank) {
        var obj = $(elt);
        return new Promise(function (res, rej) {
            var timer = setInterval(function () {
                obj.css({
                    width: (100 * tank.life).toString() + "px",
                })
                clearInterval(timer);
                res();
            }, 10);
        });
    }

    var globalFps = 5;
    $("[name='step-go']").on("click", function () {
        var newFps = parseInt($("[name='step-speed']").val());
        if (newFps <= 0) newFps = 1;
        globalFps = newFps;
    })

    var pause = false;
    $("[name='step-pause']").on("click", function () {
        if (finished) {
            $("[name='step-pause']").html("Pause");
            finished = false;
            game();
        } else {
            pause = !pause;
        }
    });

    var A = undefined, B = undefined, p1 = undefined, p2 = undefined;

    var mode = 0;

    $("[name='toggle-mode']").on("click", function () {
        mode = !mode;
        if (mode) {
            $(".board-container").hide();
            $("[control='animation']").hide();
            $(".std").show();
            pause = true;
            $(this).html("ANIMATION");
        } else {
            $(".board-container").show();
            $("[control='animation']").show();
            $(".std").hide();
            pause = false;
            $(this).html("STDIO");
        }
    })

    var finished = false;

    var rotationDeg = [
        -90,
        0,
        90,
        180
    ]

    function TankSpirit(parent, tank, index) {
        this.position = [(tank.position[0] + 5) / 30 * 100, (tank.position[1] + 5) / 30 * 100];
        this.direction = tank.direction;
        this.life = tank.life;
        this.index = index;
        this.parent = $(parent);
        this.self = $("<div class='tank'><svg version=\"1.1\" xmlns=\"https://www.w3.org/2000/svg\" xmlns:xlink=\"https://www.w3.org/1999/xlink\" width=\"70\" height=\"110\">\n" +
            "    <rect width=\"70\" height=\"70\" x=\"0\" y=\"30\" rx=\"10\" ry=\"10\" style=\"fill:#333\" />\n" +
            "    <rect x=\"0\" y=\"25\" rx=\"10\" ry=\"10\" width=\"15\" height=\"80\" style=\"fill:#5c5c5c;\" />\n" +
            "    <rect x=\"55\" y=\"25\" rx=\"10\" ry=\"10\" width=\"15\" height=\"80\" style=\"fill:#5c5c5c;\" />\n" +
            "    <rect x=\"20\" y=\"90\" rx=\"10\" ry=\"10\" width=\"30\" height=\"15\" style=\"" + ((this.index !== 0) ? "fill:#c9a26c;" : "fill:#fb5555;") + "\" />\n" +
            "    <circle cx=\"35\" cy=\"65\" r=\"15\" style=\"fill-opacity: .2\" fill=\"white\" />\n" +
            "    <circle cx=\"35\" cy=\"65\" r=\"10\" style=\"fill-opacity: .3\" fill=\"white\" />\n" +
            "    <circle cx=\"35\" cy=\"65\" r=\"5\" style=\"fill-opacity: .5\" fill=\"white\" />\n" +
            "    <g id=\"gun\">\n" +
            "        <line x1=\"35\" y1=\"5\" x2=\"35\" y2=\"57.5\" style=\"stroke: #8d8d8d; stroke-width: 8\" />\n" +
            "        <rect x=\"32\" y=\"0\" rx=\"5\" ry=\"5\" width=\"6\" height=\"10\" style=\"fill:#8d8d8d;\" />\n" +
            "    </g>\n" +
            "</svg></div>");
        this.self.css({
            transform: "rotate(" + rotationDeg[this.direction].toString() + "deg) translate(-50%, -50%)",
            top: this.position[1].toString() + "%",
            left: this.position[0].toString() + "%"
        })
        this.parent.append(this.self);
    }

    TankSpirit.prototype.render = function (tank) {
        let prev = this;

        return new Promise(function (res, rej) {
            Promise.all([
                animateRotation(prev.self, rotationDeg[prev.direction], rotationDeg[tank.direction], 1000 / globalFps),
                animatePosition(prev.self, prev.position, [(tank.position[0] + 5) / 29 * 100, (tank.position[1] + 5) / 29 * 100], 1000 / globalFps)
            ]).then(function () {
                prev.position = [(tank.position[0] + 5) / 29 * 100, (tank.position[1] + 5) / 29 * 100];
                prev.direction = tank.direction;
                prev.life = tank.prev;
                res();
            })
        })
    }

    function BulletSpirit(parent, bullet) {
        this.position = bullet.position;
        this.direction = bullet.direction;
        this.parent = $(parent);
        this.self = $("<div class='tank'><svg version=\"1.1\" xmlns=\"https://www.w3.org/2000/svg\" xmlns:xlink=\"https://www.w3.org/1999/xlink\" width=\"70\" height=\"110\">\n" +
            "    <rect width=\"5\" height=\"30\" x=\"32.5\" y=\"40\" style=\";fill:#ffc927\" />\n" +
            "</svg></div>");
        this.self.css({
            transform: "rotate(" + rotationDeg[this.direction].toString() + "deg) translate(-50%, -50%)",
            top: ((bullet.position[1] + 5) / 29 * 100).toString() + "%",
            left: ((bullet.position[0] + 5) / 29 * 100).toString() + "%"
        });
        this.parent.append(this.self);
    }

    BulletSpirit.prototype.render = function (bullet) {

        let prev = this;

        return new Promise(function (res, rej) {
            animatePosition(prev.self, [(prev.position[0] + 5) / 29 * 100, (prev.position[1] + 5) / 29 * 100], [(bullet.position[0] + 5) / 29 * 100, (bullet.position[1] + 5) / 29 * 100], 1000 / globalFps)
                .then(function () {
                    prev.position = bullet.position;
                    res();
                })
        })
    }

    BulletSpirit.prototype.bust = function () {
        if (this.self) {
            this.self.remove();
        }
    }

    function checkBulletValid(spirit, bullet) {
        return !(
            (spirit.direction === 0 && (bullet.position[0] - spirit.position[0] !== -2 || bullet.position[1] !== spirit.position[1])) ||
            (spirit.direction === 2 && (bullet.position[0] - spirit.position[0] !== 2 || bullet.position[1] !== spirit.position[1])) ||
            (spirit.direction === 1 && (bullet.position[1] - spirit.position[1] !== -2 || bullet.position[0] !== spirit.position[0])) ||
            (spirit.direction === 3 && (bullet.position[1] - spirit.position[1] !== 2 || bullet.position[0] !== spirit.position[0]))
        );
    }


    function game() {
        var tanks = [];
        var bullets = [];

        var border, lifeFixedA, lifeFixedB, lifePointA, lifePointB;

        var container = $(".board-container");
        container.html("");

        getGameResult().then(function (result) {
            var frameid = 1;

            A = result.A;
            B = result.B;
            p1 = result.p1;
            p2 = result.p2;
            result = result.record;

            $("[data='stdout-A']").html(A.stdout);
            $("[data='stderr-A']").html(A.stderr);
            $("[data='stdout-B']").html(B.stdout);
            $("[data='stderr-B']").html(B.stderr);

            result[0].tanks.forEach(function (item, index) {
                tanks.push(new TankSpirit(container, item, index));
            });

            result[0].bullets.forEach(function (item) {
                bullets.push(new BulletSpirit(container, item));
            });

            border = $("<div class='border'> </div>");
            var borderWidth = 20;
            container.append(border);

            lifeFixedA = $("<div class='lifeFixed' style='left: 0'>&nbsp;" + p1 + "</div>");
            lifeFixedB = $("<div class='lifeFixed' style='right: 0'>" + p2 + "&nbsp;</div>");
            lifePointA = $("<div class='lifepointA'></div>");
            lifePointB = $("<div class='lifepointB'></div>");
            container.append(lifeFixedA);
            container.append(lifeFixedB);
            container.append(lifePointA);
            container.append(lifePointB);

            function frame() {
                var fd = result[frameid];

                var promises = [
                    new Promise(function (res, rej) {
                        setTimeout(function () {
                            res();
                        }, 1000 / globalFps)
                    })
                ];

                if (!pause) {
                    promises.push(animateBorder(
                        border,
                        borderWidth / 30 * 100,
                        (20 - fd.shrink * 2) / 30 * 100,
                        1000 / globalFps
                    ));

                    promises.push(animateLife(
                        lifePointA,
                        fd.tanks[0],
                    ));

                    promises.push(animateLife(
                        lifePointB,
                        fd.tanks[1],
                    ));

                    fd.tanks.forEach(function (item, index) {
                        promises.push(tanks[index].render(item));
                    });

                    borderWidth = 20 - fd.shrink * 2

                    var i;
                    for (i = 0; i < bullets.length; i++) {
                        if (i >= fd.bullets.length || !checkBulletValid(bullets[i], fd.bullets[i])) {
                            bullets[i].bust();
                            bullets.splice(i, 1);
                            i--;
                        } else {
                            promises.push(bullets[i].render(fd.bullets[i]));
                        }
                    }
                }

                Promise.all(promises).then(function () {
                    if (!pause) {
                        for (; i < fd.bullets.length; i++) {
                            bullets.push(new BulletSpirit(container, fd.bullets[i]));
                        }
                        console.log(frameid, result.length);
                        frameid++;
                    }
                    if (frameid < result.length) {
                        frame();
                    } else {
                        finished = true;
                        $("[name='step-pause']").html("Replay");
                    }
                })
            }

            frame();
        });
    }

    game();


});
