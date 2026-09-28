/*
 * Match replay viewer.
 *
 * Loads /match/get/:id and plays the recorded snapshots on a HiDPI canvas
 * with interpolated motion between rounds.
 *
 * Three game versions share one page. Everything that differs between them
 * lives in a "rule set" (CLASSIC for the original 1v1 game, TEAMS for the
 * 2v2 v4 game, ITEMS for v5 = TEAMS plus random items); the Board, Tape and
 * Player below only consume the normalised round description a rule set
 * produces:
 *
 *   {
 *     round, moves: [move | null per tank],
 *     bullets: [{team, owner, dir, from, stop, endAt, kind, speed, pathTrail,
 *                track, bounce}],
 *                 kind: "fly" | "hit" | "shield" | "out" | "wall" | "absorbed";
 *                 the bullet travels from -> stop during p in [0, endAt], or
 *                 along track [{at, q}] (bounces) when present; bounce: it can
 *                 still ricochet at the start of the round
 *     bursts:   [{at, p, dur, scale, color}]   rings of debris, gone at rest
 *     floaters: [{text, tank, p, dur, color}]          damage / heal numbers
 *     flashes:  [{tank, p, dur, strength}]             white flash on a tank
 *     hurt: [bool per tank], outside: [bool per tank],
 *     marks: [{kind: "hit" | "kill" | "crash" | "pickup", side, team}], zone: bool,
 *     events: [feed events, rule-set specific],
 *     items:   [{id, type, at, enter, exit, p, by}]    v5 items this round:
 *                 enter "spawn" at p; exit "pickup" (by tank) or "gone" at p
 *     status:  [{tank, p, set: {shield | jam | buff}}]  tank state changes
 *                 mid-round (from the previous snapshot; the next one at rest)
 *     blocks:  [{tank, at, p}]                          shield absorbed a shot
 *     pushes:  [{tank, dir, edge, p}]                   v5 push back: a blocked
 *                 tank nudges along dir, bumps `edge` at p, slides back a cell
 *   }
 */
require(["jquery", "/js/checkLogin"], function ($, check) {
    "use strict";

    check().then(function (result) {
        if (result) $("#signin").children().text(result).attr("href", "/profile");
    });

    var MAP = 20;
    var BASE_RPS = 5; // rounds per second at 1x speed
    var SPEEDS = [0.5, 1, 2];
    var DIR = [[-1, 0], [0, -1], [1, 0], [0, 1]]; // left, up, right, down
    var DIR_ANGLE = [Math.PI, -Math.PI / 2, 0, Math.PI / 2];
    var MOVE_NAMES = ["straight", "left", "right"];
    var MOVE_ARROWS = ["↑", "↰", "↱"];
    var TEAM = ["a", "b"];

    var reduceMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var $root = $("#replay");
    var $stdioCard = $(".replay-stdio");
    var el = function (role) { return $root.find("[data-role='" + role + "']"); };

    /* ------------------------------------------------------------------ *
     * Small helpers
     * ------------------------------------------------------------------ */

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function lerp(a, b, p) { return a + (b - a) * p; }
    function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
    function same(a, b) { return a[0] === b[0] && a[1] === b[1]; }
    function step(pos, dir, k) { return [pos[0] + DIR[dir][0] * k, pos[1] + DIR[dir][1] * k]; }
    function cellDist(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]); }
    function isDead(t) { return t.alive === false || t.life <= 0; }
    function pad3(n) { return (n < 10 ? "00" : n < 100 ? "0" : "") + n; }
    function sentence(s) { s = String(s || "").trim(); return s && !/[.!?]$/.test(s) ? s + "." : s; }

    function inSafeZone(pos, shrink) {
        return pos[0] >= shrink && pos[1] >= shrink &&
            pos[0] < MAP - shrink && pos[1] < MAP - shrink;
    }

    // The safe square {x0, y0, size} of a snapshot. v5 records carry it (the
    // zone may drift off-centre); older ones only count shrinks, which close
    // the zone evenly towards the centre.
    function zoneOf(snap) {
        if (snap.zone) return snap.zone;
        return {x0: snap.shrink, y0: snap.shrink, size: MAP - 2 * snap.shrink};
    }

    function zoneText(zone) {
        var size = Math.max(0, typeof zone === "number" ? MAP - 2 * zone : zone.size);
        return size > 0 ? "Safe zone closes to " + size + "×" + size :
            "Safe zone is gone — every cell now costs 1 life";
    }

    function lerpAngle(a, b, p) {
        var d = b - a;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        return a + d * p;
    }

    function cssVar(name) {
        return getComputedStyle($root[0]).getPropertyValue(name).trim();
    }

    function newRound(round, nTanks) {
        var none = [];
        for (var k = 0; k < nTanks; k++) none.push(false);
        return {
            round: round, moves: [], bullets: [], bursts: [], floaters: [], flashes: [],
            hurt: none.slice(), outside: none.slice(), marks: [], zone: false, events: [],
            items: [], status: [], blocks: [], pushes: []
        };
    }

    function easeInv(e) { return e < 0.5 ? Math.sqrt(e / 2) : 1 - Math.sqrt((1 - e) / 2); }

    /*
     * v5 push back: a tank whose move was blocked noses towards the cell it
     * wanted, bumps the edge at PUSH_HIT, then slides one cell backwards.
     * Offset along its (new) direction from where it started, in cells.
     */
    var PUSH_HIT = 0.22, PUSH_NUDGE = 0.14;

    function pushOffset(p) {
        if (p < PUSH_HIT) { var u = p / PUSH_HIT; return PUSH_NUDGE * u * (2 - u); }
        return lerp(PUSH_NUDGE, -1, ease((p - PUSH_HIT) / (1 - PUSH_HIT)));
    }

    // Feed helper: a coloured name chip.
    function tag(team, text, title) {
        var $t = $("<span class='replay-tag'>").addClass("replay-tag--" + TEAM[team]).text(text);
        if (title) $t.attr("title", title);
        return $t;
    }

    function dmg(text) { return $("<b class='replay-dmg'>").text(text); }

    // Keeps a name chip and its damage on one line.
    function keep() {
        var $k = $("<span class='replay-keep'>");
        $.each(arguments, function (n, p) { $k.append(typeof p === "string" ? document.createTextNode(p) : p); });
        return $k;
    }

    // Feed row for the tanks (name chips) caught outside the zone in a round.
    function outsideParts(tags) {
        var parts = [];
        tags.forEach(function (t, n) {
            if (n) parts.push(n === tags.length - 1 ? " and " : ", ");
            parts.push(t);
        });
        return parts.concat([" outside the zone\u00a0", dmg("−1"), tags.length > 1 ? "\u00a0each" : ""]);
    }

    /*
     * v5 items. Glyphs are the <symbol>s in disp.ejs (16x16, even-odd), so
     * the board, the scoreboard chips, the feed and the legend all draw the
     * same shapes; the colours are the --rp-item-* tokens. Each type has its
     * own hue and silhouette, none of them a team colour, gold or red.
     */
    var ITEM_TYPES = ["heal", "shield", "wide", "rapid", "bounce", "speed", "jam"];
    var BUFFS = ["wide", "rapid", "bounce", "speed"];
    var ITEM_NAMES = {heal: "Heal", shield: "Shield", wide: "Wide shot", rapid: "Rapid fire",
        bounce: "Bounce", speed: "Speed", jam: "Jam"};

    // Records store names; the bot protocol's numeric ids are accepted too.
    function itemType(t) { return typeof t === "number" ? ITEM_TYPES[t] : String(t); }

    function glyph(type) {
        var sym = document.getElementById("rp-item-" + type);
        return sym ? sym.querySelector("path").getAttribute("d") : "M4 4h8v8H4z";
    }

    // Inline item mark for the HUD, feed and legend: glyph plus optional text.
    function itemIcon(type) {
        var NS = "http://www.w3.org/2000/svg";
        var svg = document.createElementNS(NS, "svg");
        var use = document.createElementNS(NS, "use");
        svg.setAttribute("viewBox", "0 0 16 16");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("class", "replay-glyph");
        use.setAttribute("href", "#rp-item-" + type);
        svg.appendChild(use);
        return svg;
    }

    function itemTag(type, text) {
        return $("<span class='replay-item'>").addClass("replay-item--" + type)
            .append(itemIcon(type)).append(document.createTextNode(text || ITEM_NAMES[type] || type));
    }

    // What finished a tank off: the first of `steps` (in the order the
    // referee applies damage) that takes its life from `life` to 0.
    function killCause(life, steps) {
        for (var n = 0; n < steps.length; n++) {
            life -= steps[n].damage;
            if (life <= 0) return steps[n].parts;
        }
        return steps.length ? steps[steps.length - 1].parts : [];
    }

    /* ------------------------------------------------------------------ *
     * Rule set: the original 1v1 game (records without a "v" field).
     *
     *  - each round both tanks turn/move one cell, then fire into the cell
     *    ahead if their cooldown allows it (rounds 1, 4, 7, ...);
     *  - if both tanks share a cell the round stops there (collision);
     *  - otherwise every bullet moves two cells and damages (-2) any tank it
     *    touches on the way; then tanks outside the safe zone lose 1 life.
     *
     * The record only stores positions and life, so events are derived
     * from consecutive snapshots.
     * ------------------------------------------------------------------ */

    var CLASSIC = {
        maxLife: 5,

        // Index of the first path cell occupied by a tank, with that tank.
        firstHit: function (path, tanks) {
            for (var c = 0; c < path.length; c++) {
                for (var t = 0; t < tanks.length; t++) {
                    if (same(path[c], tanks[t].position)) return {cell: c, victim: t};
                }
            }
            return null;
        },

        analyzeRound: function (prev, cur, round) {
            var tanks = cur.tanks;
            var collided = same(tanks[0].position, tanks[1].position);
            var travel = collided ? 0 : 2; // bullets freeze in a collision round
            var info = newRound(round, 2);
            var hits = [];
            var j = 0;
            var firstHit = this.firstHit;

            function addHit(b, h, start) {
                // A tank driving onto a bullet (cell 0) is shown as it arrives.
                b.kind = "hit";
                b.stop = step(start, b.dir, h.cell);
                b.endAt = h.cell === 0 ? 0.8 : h.cell / 2;
                hits.push({attacker: b.owner, victim: h.victim, at: b.stop, p: b.endAt});
            }

            // Surviving bullets keep their relative order; removed ones are
            // dropped and bullets fired this round are appended.
            prev.bullets.forEach(function (b) {
                var expected = step(b.position, b.direction, travel);
                var next = cur.bullets[j];
                var bullet = {team: b.owner, owner: b.owner, dir: b.direction, from: b.position,
                    stop: expected, endAt: 1};
                if (next && next.owner === b.owner && next.direction === b.direction &&
                    same(next.position, expected)) {
                    bullet.kind = "fly";
                    j++;
                } else {
                    var path = [b.position, step(b.position, b.direction, 1), expected];
                    var h = firstHit(path, tanks);
                    if (h) addHit(bullet, h, b.position);
                    else bullet.kind = "out";
                }
                info.bullets.push(bullet);
            });

            var fired = [false, false];
            for (; j < cur.bullets.length; j++) {
                var nb = cur.bullets[j];
                fired[nb.owner] = true;
                info.bullets.push({
                    team: nb.owner, owner: nb.owner, dir: nb.direction, kind: "fly", endAt: 1,
                    from: step(nb.position, nb.direction, -travel), stop: nb.position
                });
            }

            // Tanks fire on rounds 1, 4, 7, ...; a shot missing from the record
            // was absorbed at point-blank range before it was ever stored.
            if (round % 3 === 1 && !collided) {
                tanks.forEach(function (tank, owner) {
                    if (fired[owner]) return;
                    var start = step(tank.position, tank.direction, 1);
                    var path = [start, step(start, tank.direction, 1), step(start, tank.direction, 2)];
                    var h = firstHit(path, tanks);
                    if (!h) return;
                    var bullet = {team: owner, owner: owner, dir: tank.direction, from: start};
                    addHit(bullet, h, start);
                    info.bullets.push(bullet);
                });
            }

            info.moves = prev.tanks.map(function (t, i) {
                var d = (tanks[i].direction - t.direction + 4) % 4;
                return d === 3 ? 1 : d === 1 ? 2 : 0;
            });
            info.outside = tanks.map(function (t) {
                return !collided && !inSafeZone(t.position, cur.shrink);
            });

            hits.forEach(function (h) {
                info.bursts.push({at: h.at, p: h.p, dur: 0.5, scale: 1, color: "spark"});
                info.floaters.push({text: "−2", tank: h.victim, p: h.p, dur: 0.5, color: "danger"});
                info.flashes.push({tank: h.victim, p: h.p, dur: 0.35, strength: 1});
                info.hurt[h.victim] = true;
                info.marks.push({kind: "hit", side: h.victim, team: h.attacker});
            });
            info.outside.forEach(function (o, k) {
                if (!o) return;
                info.floaters.push({text: "−1", tank: k, p: 0.6, dur: 0.4, color: "danger"});
                info.flashes.push({tank: k, p: 0.6, dur: 0.4, strength: 0.5});
                info.hurt[k] = true;
            });
            if (collided) {
                info.bursts.push({at: tanks[0].position, p: 0.5, dur: 0.5, scale: 1.8, color: "danger"});
                info.marks.push({kind: "crash"});
            }

            var events = info.events;
            if (cur.shrink !== prev.shrink) {
                info.zone = true;
                events.push({type: "zone", text: zoneText(cur.shrink)});
            }
            hits.forEach(function (h) {
                events.push({type: "hit", player: h.attacker, victim: h.victim,
                    self: h.attacker === h.victim});
            });
            info.outside.forEach(function (o, i) {
                if (o) events.push({type: "border", player: i});
            });
            if (collided) events.push({type: "collision"});
            tanks.forEach(function (t, i) {
                if (t.life > 0 || prev.tanks[i].life <= 0) return;
                events.push({type: "destroyed", player: i});
                info.marks.push({kind: "kill", side: i, team: i});
            });
            return info;
        },

        analyze: function (record) {
            var rounds = [null];
            for (var i = 1; i < record.length; i++) rounds.push(this.analyzeRound(record[i - 1], record[i], i));
            return rounds;
        },

        walls: function () { return []; },

        tankStyle: function (record, k, skins) {
            return {team: k, label: TEAM[k].toUpperCase(), shape: "classic", skin: skins.tank[k]};
        },

        bulletSkin: function (skins, b) { return skins.bullet[b.owner]; },

        teamLife: function (snap, team) { return clamp(snap.tanks[team].life, 0, this.maxLife); },
        teamMax: function () { return this.maxLife; },

        // Explain how the match ended, from the final snapshot and the judge's exit.
        endReason: function (record, exit, names) {
            var last = record[record.length - 1];
            var n = record.length - 1;
            var t = last.tanks;
            if (exit && exit !== "Normal Exit") return exit + ".";
            if (same(t[0].position, t[1].position)) {
                if (t[0].life === t[1].life) return "Tanks collided in round " + n + " with equal life.";
                return "Tanks collided in round " + n + "; the tank with less life (" +
                    Math.max(0, Math.min(t[0].life, t[1].life)) + " vs " +
                    Math.max(t[0].life, t[1].life) + ") loses.";
            }
            var dead = t.map(function (x) { return x.life <= 0; });
            if (dead[0] && dead[1]) return "Both tanks were destroyed in round " + n + ".";
            if (dead[0] || dead[1]) return names[dead[0] ? 0 : 1] + " was destroyed in round " + n + ".";
            return "The match stopped after round " + n + ".";
        },

        setupHud: function () {},

        updateHud: function (player, snap, info) {
            var max = this.maxLife;
            $root.find(".replay-player").each(function (k) {
                var life = clamp(snap.tanks[k].life, 0, max);
                var $p = $(this);
                $p.find("[data-role='hp']").text(life);
                var bar = $p.find("[data-role='lifebar']").attr("aria-valuenow", life)[0];
                bar.style.setProperty("--life", life / max);
                $p.toggleClass("is-hurt", !!(info && info.hurt[k]));
                $p.toggleClass("is-dead", snap.tanks[k].life <= 0);
                $p.find("[data-role='move']").text(info ?
                    MOVE_ARROWS[info.moves[k]] + " " + MOVE_NAMES[info.moves[k]] +
                    (info.outside[k] ? " · out" : "") : "\u00a0");
            });
        },

        describe: function (snap, names) {
            var t = snap.tanks;
            return names[0] + " at " + t[0].position.join(",") + ", life " + t[0].life + ". " +
                names[1] + " at " + t[1].position.join(",") + ", life " + t[1].life + ".";
        },

        feed: function (player, add) {
            var names = player.names;
            var who = function (k) { return tag(k, names[k]); };
            add(0, "start", ["Start · ", who(0), " at 0,0 and ", who(1), " at 19,19"]);
            player.rounds.forEach(function (r) {
                if (!r) return;
                r.events.forEach(function (e) {
                    switch (e.type) {
                        case "zone": add(r.round, "zone", [e.text]); break;
                        case "hit":
                            add(r.round, "hit", e.self ?
                                [who(e.player), " hit itself\u00a0", dmg("−2")] :
                                [who(e.player), " hit ", keep(who(e.victim), "\u00a0", dmg("−2"))]);
                            break;
                        case "border":
                            // One row per round for every tank caught outside.
                            if (e.player === 1 && r.outside[0]) break;
                            add(r.round, "border", outsideParts(r.outside[0] && r.outside[1] ?
                                [who(0), who(1)] : [who(e.player)]));
                            break;
                        case "collision": add(r.round, "collision", ["Tanks collided"]); break;
                        case "destroyed":
                            // Shells land first, then the zone takes its toll.
                            var steps = [];
                            r.events.forEach(function (x) {
                                if (x.type === "hit" && x.victim === e.player) {
                                    steps.push({damage: 2, parts: x.self ? [" by its own shell"] :
                                        [" by ", who(x.player)]});
                                }
                            });
                            if (r.outside[e.player]) steps.push({damage: 1, parts: [" outside the zone"]});
                            add(r.round, "destroyed", [who(e.player), " destroyed"].concat(
                                killCause(player.record[r.round - 1].tanks[e.player].life, steps)));
                            break;
                    }
                });
            });
        },

        formatMoves: function (line) {
            var move = MOVE_NAMES[+line];
            return line + (move && /^[0-2]$/.test(line) ? "  " + move : "");
        }
    };

    /* ------------------------------------------------------------------ *
     * Rule set: v4, 2v2 with walls and two tank types (record[0].v === 4).
     *
     * The referee records what happened each turn (moves, bullet paths and
     * events), so nothing is derived here beyond animation timing.
     * Tanks 0, 1 are team A (A1 heavy, A2 striker); 2, 3 are team B.
     * ------------------------------------------------------------------ */

    var TEAMS = {
        typeInfo: {
            heavy: {name: "heavy"},
            striker: {name: "striker"}
        },

        label: function (record, k) {
            var t = record[0].tanks[k];
            var n = 1;
            for (var j = 0; j < k; j++) if (record[0].tanks[j].team === t.team) n++;
            return TEAM[t.team].toUpperCase() + n;
        },

        analyze: function (record) {
            var rounds = [null];
            var self = this;
            var walls = {};
            this.walls(record).forEach(function (w) { walls[w[0] + "," + w[1]] = true; });
            var isWall = function (c) { return !!walls[c[0] + "," + c[1]]; };
            var teamOf = record[0].tanks.map(function (t) { return t.team; });

            for (var i = 1; i < record.length; i++) {
                var snap = record[i];
                var info = newRound(i, snap.tanks.length);
                info.moves = snap.moves || [];
                info.events = snap.events || [];
                var hitPaths = [];

                (snap.paths || []).forEach(function (path) {
                    var b = self.bullet(path, isWall, info);
                    if (b.kind === "hit" || b.kind === "shield") hitPaths.push(b);
                    info.bullets.push(b);
                });

                var took = snap.tanks.map(function () { return 0; });
                var tookAt = snap.tanks.map(function () { return 1; });
                info.events.forEach(function (e) {
                    switch (e.type) {
                        case "zone": info.zone = true; break;
                        case "hit":
                            var path = hitPaths.filter(function (b) {
                                return b.owner === e.shooter && same(b.stop, e.at);
                            })[0];
                            var p = path ? path.endAt : 0.6;
                            info.bursts.push({at: e.at, p: p, dur: 0.5, scale: 1, color: "spark"});
                            info.flashes.push({tank: e.victim, p: p, dur: 0.35, strength: 1});
                            took[e.victim] += e.damage || 2;
                            tookAt[e.victim] = Math.min(tookAt[e.victim], p);
                            info.hurt[e.victim] = true;
                            info.marks.push({kind: "hit", side: teamOf[e.victim], team: teamOf[e.shooter]});
                            break;
                        case "collision":
                            info.bursts.push({at: e.at, p: 0.5, dur: 0.5, scale: 1.8, color: "danger"});
                            e.tanks.forEach(function (k) {
                                info.flashes.push({tank: k, p: 0.5, dur: 0.35, strength: 1});
                                took[k] += 2;
                                tookAt[k] = Math.min(tookAt[k], 0.5);
                                info.hurt[k] = true;
                            });
                            info.marks.push({kind: "crash"});
                            break;
                        case "border":
                            info.outside[e.tank] = true;
                            info.hurt[e.tank] = true;
                            info.flashes.push({tank: e.tank, p: 0.6, dur: 0.4, strength: 0.5});
                            break;
                        case "destroyed":
                            info.marks.push({kind: "kill", side: teamOf[e.tank], team: teamOf[e.tank]});
                            break;
                    }
                });
                took.forEach(function (d, k) {
                    if (d > 0) info.floaters.push({text: "−" + d, tank: k, p: tookAt[k], dur: 0.5, color: "danger"});
                    if (info.outside[k]) info.floaters.push({text: "−1", tank: k, p: 0.6, dur: 0.4, color: "danger"});
                });
                if (self.extend) self.extend(info, record, i, hitPaths);
                rounds.push(info);
            }
            self.labels = record[0].tanks.map(function (t, k) { return self.label(record, k); });
            return rounds;
        },

        /*
         * One recorded bullet path, timed within the round. A bullet checks
         * speed + 1 cells (its own, then one per step), so each step takes
         * 1/speed of the round. A ricochet (v5 `via`) spends a step in its
         * cell: the bullet runs to the wall face and back, with a spark at
         * the face. A shell that strikes a tank lands by 0.8 of the round
         * at the latest, so the impact (and a shield breaking) plays out
         * before the round comes to rest.
         */
        bullet: function (path, isWall, info) {
            var dir = path.direction, cur = path.from, steps = 0;
            var speed = path.speed || 2, need = cellDist(path.via && path.via.length ? path.via[path.via.length - 1] : path.from, path.to);
            (path.via || []).forEach(function (v, n) { need += cellDist(n ? path.via[n - 1] : path.from, v) + 1; });
            if ((path.end === "hit" || path.end === "shield") && need / speed > 0.8) speed = need / 0.8;
            var b = {team: path.team, owner: path.owner, dir: dir, speed: path.speed || 2,
                from: path.from, stop: path.to, endAt: 1, kind: path.end, pathTrail: true};
            var track = [{at: cur, q: 0, dir: dir}];
            (path.via || []).forEach(function (v) {
                steps += cellDist(cur, v);
                var face = [v[0] + DIR[dir][0] * 0.5, v[1] + DIR[dir][1] * 0.5];
                track.push({at: v, q: steps / speed, dir: dir});
                track.push({at: face, q: (steps + 0.5) / speed, dir: (dir + 2) % 4});
                info.bursts.push({at: face, p: (steps + 0.5) / speed, dur: 0.35, scale: 0.35, color: "bounce"});
                if (b.bounceAt === undefined) b.bounceAt = (steps + 0.5) / speed;
                steps += 1;
                dir = (dir + 2) % 4;
                track.push({at: v, q: steps / speed, dir: dir});
                cur = v;
            });
            if (b.bounceAt !== undefined) b.bounce = true;
            var total = steps + cellDist(cur, path.to);
            switch (path.end) {
                case "hit":
                case "shield":
                    b.endAt = total === 0 ? 0.8 : clamp(total / speed, 0.15, 0.8);
                    break;
                case "wall":
                case "absorbed":
                    // Stop at the face of the wall, where the spark goes.
                    var face = isWall(path.to) ? -0.5 : 0.5;
                    b.stop = [path.to[0] + DIR[dir][0] * face, path.to[1] + DIR[dir][1] * face];
                    b.endAt = path.end === "absorbed" ? 0.12 :
                        clamp((total + face) / speed, 0.12, 1);
                    info.bursts.push({at: b.stop, p: b.endAt, dur: 0.4,
                        scale: path.end === "absorbed" ? 0.3 : 0.45, color: "spark"});
                    break;
            }
            if (track.length > 1) {
                track.push({at: b.stop, q: Math.max(b.endAt, track[track.length - 1].q), dir: dir});
                b.track = track;
                b.dir = dir; // at rest it faces the way it now flies
            }
            return b;
        },

        walls: function (record) { return (record[0].map && record[0].map.walls) || []; },

        tankStyle: function (record, k) {
            var t = record[0].tanks[k];
            // Custom skins are not used here: the hull shape is what tells the
            // two tank types apart.
            return {team: t.team, label: this.label(record, k), shape: t.type === "heavy" ? "heavy" : "striker", skin: null};
        },

        bulletSkin: function (skins, b) { return skins.bullet[b.team]; },

        teamLife: function (snap, team) {
            return snap.tanks.reduce(function (s, t) { return s + (t.team === team ? Math.max(0, t.life) : 0); }, 0);
        },

        teamMax: function (record, team) { return this.teamLife(record[0], team); },

        endReason: function (record, exit) {
            if (exit && exit !== "Normal Exit") return exit + ".";
            var last = record[record.length - 1];
            var end = (last.events || []).filter(function (e) { return e.type === "end"; })[0];
            if (end && end.text) return sentence(end.text);
            return "The match stopped after round " + (record.length - 1) + ".";
        },

        setupHud: function (player) {
            var tpl = document.getElementById("replay-hud-v4");
            var record = player.record, names = player.names, self = this;
            $root.addClass("replay-stage--v4");
            el("hud").empty().append(document.importNode(tpl.content, true));
            $stdioCard.find(".replay-stdio__hint")
                .text("One line per round on stdout: moves for your two tanks, e.g. “0 2” (0 straight, 1 left, 2 right)");

            el("hud").find(".replay-team").each(function () {
                var team = +this.getAttribute("data-team");
                $(this).find("[data-role='team-name']").text(names[team]).attr("title", names[team]);
                $(this).find("[data-role='team-max']").text("/" + self.teamMax(record, team));
            });
            // Unit rows are filled in team order: the first unit slot of a team
            // gets that team's first tank, and so on.
            var slots = [0, 0];
            record[0].tanks.forEach(function (t, k) {
                var $u = el("hud").find(".replay-team[data-team='" + t.team + "'] .replay-unit").eq(slots[t.team]++);
                var max = Math.max(1, t.life);
                $u.attr("data-tank", k).addClass("replay-unit--" + t.type);
                $u.find("use").attr("href", "#rp-icon-" + (t.type === "heavy" ? "heavy" : "striker"));
                $u.find("[data-role='unit-label']").text(self.label(record, k));
                var $bar = $u.find("[data-role='lifebar']");
                $bar[0].style.setProperty("--segs", max); // jQuery 1.10 .css() ignores custom properties
                $bar.attr({"aria-valuemax": max, "aria-valuenow": max,
                        "aria-label": self.label(record, k) + " (" + t.type + ") life"});
                $u.attr("title", self.label(record, k) + " · " + t.type + " · " + max + " life");
            });
        },

        updateHud: function (player, snap, info) {
            var record = player.record, self = this;
            el("hud").find(".replay-unit").each(function () {
                var k = +this.getAttribute("data-tank");
                var t = snap.tanks[k], max = Math.max(1, record[0].tanks[k].life);
                var life = clamp(t.life, 0, max);
                var $u = $(this);
                $u.find("[data-role='hp']").text(life);
                var bar = $u.find("[data-role='lifebar']").attr("aria-valuenow", life)[0];
                bar.style.setProperty("--life", life / max);
                $u.toggleClass("is-hurt", !!(info && info.hurt[k]));
                $u.toggleClass("is-dead", isDead(t));
                var m = info ? info.moves[k] : null;
                var $move = $u.find("[data-role='move']");
                if (isDead(t)) {
                    $move.text("✕").attr("title", "Destroyed");
                    $u.find("[data-role='move-name']").text("destroyed");
                } else if (m === null || m === undefined) {
                    $move.text("\u00a0").removeAttr("title");
                    $u.find("[data-role='move-name']").text("");
                } else {
                    $move.text(MOVE_ARROWS[m]).attr("title", MOVE_NAMES[m]);
                    $u.find("[data-role='move-name']").text(MOVE_NAMES[m] + (info.outside[k] ? " · out" : ""));
                }
            });
            el("hud").find(".replay-team").each(function () {
                var team = +this.getAttribute("data-team");
                var alive = snap.tanks.filter(function (t) { return t.team === team && !isDead(t); }).length;
                $(this).find("[data-role='team-life']").text(self.teamLife(snap, team));
                $(this).toggleClass("is-dead", alive === 0);
            });
        },

        describe: function (snap, names) {
            var self = this;
            return snap.tanks.map(function (t, k) {
                return self.labels[k] + " (" + names[t.team] + ", " + t.type + ") " +
                    (isDead(t) ? "destroyed" : "at " + t.position.join(",") + ", life " + t.life);
            }).join(". ") + ".";
        },

        zoneParts: function (r, record) { return [zoneText(zoneOf(record[r.round]))]; },

        feed: function (player, add) {
            var record = player.record, names = player.names, labels = this.labels, self = this;
            var tanks = record[0].tanks;
            var who = function (k) {
                return tag(tanks[k].team, labels[k], names[tanks[k].team] + " · " + tanks[k].type);
            };
            add(0, "start", ["Start · ", tag(0, names[0]), " vs ", tag(1, names[1]),
                " · heavy + striker each"]);
            player.rounds.forEach(function (r) {
                if (!r) return;
                r.events.forEach(function (e) {
                    switch (e.type) {
                        case "zone": add(r.round, "zone", self.zoneParts(r, record)); break;
                        case "hit":
                            add(r.round, "hit", [who(e.shooter), " hit ", keep(who(e.victim), "\u00a0",
                                dmg("−" + (e.damage || 2)))]);
                            break;
                        case "collision":
                            add(r.round, "collision", [who(e.tanks[0]), " and ", who(e.tanks[1]),
                                " collided\u00a0", dmg("−2"), "\u00a0each"]);
                            break;
                        case "border":
                            // One row per round for every tank caught outside.
                            var out = r.events.filter(function (x) { return x.type === "border"; });
                            if (out[0] !== e) break;
                            add(r.round, "border", outsideParts(out.map(function (x) { return who(x.tank); })));
                            break;
                        case "destroyed":
                            // Damage order: collisions, then shells, then the zone.
                            var steps = [];
                            r.events.forEach(function (x) {
                                if (x.type === "collision" && x.tanks.indexOf(e.tank) >= 0) {
                                    steps.push({damage: 2, parts: [" in a collision with ",
                                        who(x.tanks[0] === e.tank ? x.tanks[1] : x.tanks[0])]});
                                }
                            });
                            r.events.forEach(function (x) {
                                if (x.type === "hit" && x.victim === e.tank) {
                                    steps.push({damage: x.damage || 2, parts: [" by ", who(x.shooter)]});
                                }
                            });
                            if (r.outside[e.tank]) steps.push({damage: 1, parts: [" outside the zone"]});
                            add(r.round, "destroyed", [who(e.tank), " destroyed"].concat(
                                killCause(record[r.round - 1].tanks[e.tank].life, steps)));
                            break;
                        // "end" is added by the Player from endReason().
                        default:
                            if (self.feedEvent) self.feedEvent(e, r, add, who, record);
                    }
                });
            });
        },

        formatMoves: function (line) {
            var m = /^\s*([0-2])\s+([0-2])\s*$/.exec(line);
            return m ? line + "  " + MOVE_NAMES[+m[1]] + " · " + MOVE_NAMES[+m[2]] : line;
        }
    };

    /* ------------------------------------------------------------------ *
     * Rule set: v5 = v4 plus random items (record[0].v === 5).
     *
     * Items drop on the board; driving onto one picks it up: heal, a
     * one-hit shield, four timed buffs (wide = 3 shells side by side,
     * rapid = shorter cooldown, bounce = shells ricochet once, speed =
     * 2-cell moves) and jam (the enemy tanks can't fire for a while).
     * Tunables live in record[0].rules. Everything v4 draws still applies;
     * this adds the item and tank-state cues on top of TEAMS' round
     * description and the rows for the new events in the feed.
     *
     * With rules.pushBack a blocked tank is pushed one cell backwards
     * ("pushed" events). That happens most rounds, so it is shown on the
     * board and in the scoreboard's move tooltip, not in the feed.
     * ------------------------------------------------------------------ */

    var ITEMS = Object.create(TEAMS);

    ITEMS.defaults = {itemStart: 8, itemEvery: 8, itemMax: 3, healAmount: 2, buffTurns: 8,
        jamTurns: 4, shrinkEvery: 16, pushBack: 0};

    ITEMS.analyze = function (record) {
        this.cfg = $.extend({}, this.defaults, record[0].rules || {});
        this.maxLife = record[0].tanks.map(function (t) { return Math.max(1, t.life); });
        return TEAMS.analyze.call(this, record);
    };

    ITEMS.zoneEvery = function () { return this.cfg.shrinkEvery || 16; };

    // Adds the v5 cues to TEAMS' description of round i.
    ITEMS.extend = function (info, record, i, hitPaths) {
        var prev = record[i - 1], snap = record[i], cfg = this.cfg, maxLife = this.maxLife;
        var teamOf = function (k) { return record[0].tanks[k].team; };
        // Push back comes right after the move, before anything is picked up.
        var pushed = {};
        if (+cfg.pushBack) info.events.forEach(function (e) {
            if (e.type !== "pushed") return;
            var dir = snap.tanks[e.tank].direction;
            pushed[e.tank] = true;
            info.pushes.push({tank: e.tank, dir: dir, edge: step(prev.tanks[e.tank].position, dir, 0.5), p: PUSH_HIT});
        });
        // Pickups happen after the move: as the tank rolls onto the item.
        var arrive = function (k) {
            if (pushed[k]) return PUSH_HIT + (1 - PUSH_HIT) * easeInv((PUSH_NUDGE + 0.6) / (PUSH_NUDGE + 1));
            var d = cellDist(prev.tanks[k].position, snap.tanks[k].position);
            if (!d) return 0.3;
            return easeInv((d - 0.4) / d); // most of the way into its last cell
        };
        var picked = {}, gone = {}, bouncePick = {};
        info.events.forEach(function (e) {
            var p;
            switch (e.type) {
                case "pickup":
                    var type = itemType(e.item);
                    p = arrive(e.tank);
                    picked[e.id] = {p: p, by: e.tank};
                    info.marks.push({kind: "pickup", side: teamOf(e.tank), team: teamOf(e.tank)});
                    info.bursts.push({at: e.at, p: p, dur: 0.45, scale: 0.75, color: type});
                    if (type === "shield") info.status.push({tank: e.tank, p: p, set: {shield: 1}});
                    else if (BUFFS.indexOf(type) >= 0) info.status.push({tank: e.tank, p: p, set: {buff: type}});
                    if (type === "bounce") bouncePick[e.tank] = true;
                    if (type === "heal") {
                        var before = Math.max(0, prev.tanks[e.tank].life);
                        var gain = Math.min(maxLife[e.tank], before + cfg.healAmount) - before;
                        e.gain = gain;
                        if (gain > 0) info.floaters.push({text: "+" + gain, tank: e.tank, p: p, dur: 0.5, color: "heal"});
                    }
                    break;
                case "jam":
                    p = arrive(e.by) + 0.08;
                    e.tanks.forEach(function (k) {
                        info.status.push({tank: k, p: p, set: {jam: 1}});
                        info.bursts.push({at: snap.tanks[k].position, p: p, dur: 0.4, scale: 0.8, color: "jam"});
                    });
                    break;
                case "shield":
                    var path = hitPaths.filter(function (b) {
                        return b.owner === e.shooter && b.kind === "shield" && same(b.stop, e.at);
                    })[0];
                    p = path ? path.endAt : 0.6;
                    info.blocks.push({tank: e.tank, at: e.at, p: p});
                    info.status.push({tank: e.tank, p: p, set: {shield: 0}});
                    break;
                case "itemGone": gone[e.id] = true; break;
                case "spawn":
                    // Drops in at the end of the round and lands with a ring.
                    info.items.push({id: e.id, type: itemType(e.item), at: e.at, enter: "spawn", p: 0.55});
                    info.bursts.push({at: e.at, p: 0.85, dur: 0.3, scale: 0.55, color: itemType(e.item)});
                    break;
            }
        });
        // Items on the board when the round starts: taken, swallowed by the
        // zone (as it closes) or still there.
        (prev.items || []).forEach(function (it) {
            var o = {id: it.id, type: itemType(it.type), at: it.position};
            if (picked[it.id]) { o.exit = "pickup"; o.p = picked[it.id].p; o.by = picked[it.id].by; }
            else if (gone[it.id]) { o.exit = "gone"; o.p = 0.7; }
            info.items.push(o);
        });
        // Which shells can still ricochet: new ones from a tank with the
        // bounce buff, older ones as they were stored last round.
        (snap.paths || []).forEach(function (path, n) {
            var b = info.bullets[n];
            if (!b || b.bounce) return;
            if (path.spawned) {
                var t = prev.tanks[path.owner];
                b.bounce = !!((t.buffs && t.buffs.bounce > 0) || bouncePick[path.owner]);
            } else {
                b.bounce = (prev.bullets || []).some(function (x) {
                    return x.owner === path.owner && x.direction === path.direction &&
                        same(x.position, path.from) && x.bounce > 0;
                });
            }
        });
    };

    ITEMS.setupHud = function (player) {
        TEAMS.setupHud.call(this, player);
        var cfg = this.cfg, weights = cfg.items || {};
        $root.addClass("replay-stage--v5");
        // Legend: numbers from this match's rules; types that never drop are left out.
        $root.find("[data-rule]").each(function () {
            var v = cfg[this.getAttribute("data-rule")];
            if (v !== undefined) $(this).text(v);
        });
        $root.find(".replay-help__items [data-item]").each(function () {
            var on = +(weights[this.getAttribute("data-item")] || 0) > 0;
            $(this).toggleClass("is-off", !on);
        });
        el("push-note").prop("hidden", !+cfg.pushBack);
    };

    ITEMS.updateHud = function (player, snap, info) {
        TEAMS.updateHud.call(this, player, snap, info);
        var labels = this.labels;
        (info ? info.pushes : []).forEach(function (c) {
            if (isDead(snap.tanks[c.tank])) return;
            var $u = el("hud").find(".replay-unit[data-tank='" + c.tank + "']");
            $u.find("[data-role='move']").attr("title", function (n, t) { return (t ? t + " · " : "") + "pushed back"; });
            $u.find("[data-role='move-name']").text(function (n, t) { return (t ? t + " · " : "") + "pushed"; });
        });
        el("hud").find(".replay-unit").each(function () {
            var k = +this.getAttribute("data-tank"), t = snap.tanks[k];
            var chips = [];
            if (!isDead(t)) {
                if (t.shield) chips.push({type: "shield", title: "Shield: blocks the next hit"});
                BUFFS.forEach(function (b) {
                    var n = t.buffs ? t.buffs[b] : 0;
                    if (n > 0) chips.push({type: b, n: n, title: ITEM_NAMES[b] + ": " + n + " more turn" + (n > 1 ? "s" : "")});
                });
                if (t.jam > 0) chips.push({type: "jam", n: t.jam,
                    title: "Jammed: can't fire for " + t.jam + " more turn" + (t.jam > 1 ? "s" : "")});
            }
            var key = chips.map(function (c) { return c.type + (c.n || ""); }).join(",");
            var $fx = $(this).find("[data-role='fx']");
            if ($fx.attr("data-key") === key) return;
            $fx.attr("data-key", key).empty();
            chips.forEach(function (c) {
                var $c = $("<span class='replay-chip'>").addClass("replay-chip--" + c.type)
                    .attr("title", labels[k] + " · " + c.title).append(itemIcon(c.type));
                if (c.n) $c.append($("<b>").text(c.n));
                $fx.append($c);
            });
            $fx.attr("aria-label", chips.length ? labels[k] + ": " + chips.map(function (c) { return c.title; }).join("; ") : null);
        });
    };

    ITEMS.describe = function (snap, names) {
        var text = TEAMS.describe.call(this, snap, names);
        var items = (snap.items || []).map(function (it) {
            return ITEM_NAMES[itemType(it.type)] + " at " + it.position.join(",");
        });
        return text + (items.length ? " Items: " + items.join(", ") + "." : "");
    };

    // Items the closing zone swallowed ride along on the zone row.
    ITEMS.zoneParts = function (r, record) {
        var parts = TEAMS.zoneParts.call(this, r, record);
        var gone = this.goneItems(r, record);
        if (gone.length) {
            parts.push(" · took ");
            gone.forEach(function (type, n) { parts.push(n ? ", " : "", itemTag(type)); });
        }
        return parts;
    };

    ITEMS.goneItems = function (r, record) {
        var prev = record[r.round - 1].items || [];
        return r.events.filter(function (e) { return e.type === "itemGone"; }).map(function (e) {
            var it = prev.filter(function (x) { return x.id === e.id; })[0];
            return it ? itemType(it.type) : "heal";
        });
    };

    ITEMS.feedEvent = function (e, r, add, who, record) {
        var cfg = this.cfg, first = function (type) {
            return r.events.filter(function (x) { return x.type === type; })[0] === e;
        };
        switch (e.type) {
            case "pickup":
                var type = itemType(e.item);
                if (type === "jam") break; // the jam row says it
                var parts = [who(e.tank), " picked up ", itemTag(type)];
                if (type === "heal") {
                    parts.push(e.gain > 0 ? " " : " · already full",
                        e.gain > 0 ? $("<b class='replay-heal'>").text("+" + e.gain) : "");
                }
                add(r.round, "pickup", parts);
                break;
            case "jam":
                var victims = e.tanks.map(function (k) { return who(k); });
                var list = [];
                victims.forEach(function (v, n) { list.push(n ? (n === victims.length - 1 ? " and " : ", ") : "", v); });
                add(r.round, "jam", [who(e.by), " picked up ", itemTag("jam"), " · "].concat(list,
                    [" can't fire for " + cfg.jamTurns + " turns"]));
                break;
            case "shield":
                add(r.round, "shield", [keep(who(e.tank), "’s ", itemTag("shield", "shield")), " blocked ", who(e.shooter)]);
                break;
            case "spawn":
                add(r.round, "spawn", [itemTag(itemType(e.item)), " dropped at " + e.at.join(",")]);
                break;
            case "expire":
                // One quiet row per round for everything that wore off.
                if (!first("expire")) break;
                var ended = ["Wore off · "];
                r.events.filter(function (x) { return x.type === "expire"; }).forEach(function (x, n) {
                    if (n) ended.push(", ");
                    ended.push(keep(who(x.tank), " ", itemTag(x.buff)));
                });
                add(r.round, "expire", ended);
                break;
            case "itemGone":
                // Normally on the zone row; this covers a record without one.
                if (!first("itemGone") || r.events.some(function (x) { return x.type === "zone"; })) break;
                var took = ["The zone took "];
                this.goneItems(r, record).forEach(function (type, n) { took.push(n ? ", " : "", itemTag(type)); });
                add(r.round, "spawn", took);
                break;
        }
    };

    /* ------------------------------------------------------------------ *
     * Board renderer
     * ------------------------------------------------------------------ */

    function Board(canvas, record, rounds, rules, skins) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.record = record;
        this.rounds = rounds;
        this.rules = rules;
        this.skins = skins;
        this.walls = rules.walls(record).slice().sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; });
        this.wallSet = {};
        this.walls.forEach(function (w) { this.wallSet[w[0] + "," + w[1]] = true; }, this);
        this.colors = {
            a: cssVar("--rp-a"), b: cssVar("--rp-b"),
            ink: cssVar("--rp-ink"), muted: cssVar("--rp-muted"),
            grid: cssVar("--rp-grid"), paper: cssVar("--rp-paper"),
            outside: cssVar("--rp-outside"), danger: cssVar("--rp-danger"),
            dangerTint: cssVar("--rp-danger-tint"), tread: cssVar("--rp-tread"),
            spark: cssVar("--rp-spark"), gold: cssVar("--rp-gold"),
            wallTop: cssVar("--rp-wall-top"), wallSide: cssVar("--rp-wall-side"),
            wallEdge: cssVar("--rp-wall-edge"), itemTile: cssVar("--rp-item-tile"),
            next: cssVar("--rp-next-zone")
        };
        ITEM_TYPES.forEach(function (type) { this.colors[type] = cssVar("--rp-item-" + type); }, this);
        this.glyphs = {};
        if (window.Path2D) ITEM_TYPES.forEach(function (type) { this.glyphs[type] = new Path2D(glyph(type)); }, this);
        this.zoneEvery = rules.zoneEvery ? rules.zoneEvery() : 16;
        this.styles = record[0].tanks.map(function (t, k) { return rules.tankStyle(record, k, skins); });

        // The view always shows the map plus a ring for coordinates; it grows
        // if a tank ever wandered further out.
        var lo = -1, hi = MAP;
        record.forEach(function (s) {
            s.tanks.forEach(function (t) {
                lo = Math.min(lo, t.position[0], t.position[1]);
                hi = Math.max(hi, t.position[0], t.position[1]);
            });
        });
        this.lo = lo - 1;
        this.cells = hi + 1 - this.lo + 1;
        this.hatch = null;
        this.layouts = [];
        this.sizes = {};
    }

    Board.prototype.resize = function () {
        var rect = this.canvas.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        this.size = rect.width;
        this.canvas.width = Math.round(rect.width * dpr);
        this.canvas.height = Math.round(rect.width * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.cell = this.size / this.cells;
        this.hatch = this.makeHatch(dpr);
        this.layouts = []; // text sizes in cells depend on the cell size
        this.sizes = {};
    };

    Board.prototype.makeHatch = function (dpr) {
        var s = Math.max(6, Math.round(this.cell / 3));
        var c = document.createElement("canvas");
        c.width = c.height = s * dpr;
        var g = c.getContext("2d");
        g.scale(dpr, dpr);
        g.fillStyle = this.colors.dangerTint;
        g.fillRect(0, 0, s, s);
        g.strokeStyle = this.colors.danger;
        g.globalAlpha = 0.2;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(0, s); g.lineTo(s, 0);
        g.moveTo(-s / 2, s / 2); g.lineTo(s / 2, -s / 2);
        g.moveTo(s / 2, s * 1.5); g.lineTo(s * 1.5, s / 2);
        g.stroke();
        var pattern = this.ctx.createPattern(c, "repeat");
        if (pattern.setTransform && window.DOMMatrix) pattern.setTransform(new DOMMatrix().scale(1 / dpr));
        return pattern;
    };

    // Cell coordinate -> canvas pixel (top-left corner of the cell).
    Board.prototype.px = function (v) { return (v - this.lo) * this.cell; };
    // Cell coordinate -> canvas pixel (cell centre).
    Board.prototype.cx = function (v) { return (v - this.lo + 0.5) * this.cell; };

    Board.prototype.color = function (key) {
        return key === 0 ? this.colors.a : key === 1 ? this.colors.b : this.colors[key];
    };

    // Tanks sharing a cell are spread apart so all of them stay visible.
    function spread(tanks, k) {
        var group = [];
        tanks.forEach(function (t, j) {
            if (!isDead(t) && same(t.position, tanks[k].position)) group.push(j);
        });
        if (group.length < 2) return [0, 0];
        var idx = group.indexOf(k);
        if (group.length === 2) return idx === 0 ? [-0.2, -0.2] : [0.2, 0.2];
        var a = -3 * Math.PI / 4 + idx * 2 * Math.PI / group.length;
        return [Math.cos(a) * 0.24, Math.sin(a) * 0.24];
    }

    Board.prototype.labelFont = function () {
        return Math.max(7, Math.round(this.cell * 0.34)) + "px " + cssVar("--rp-font-pixel");
    };

    Board.prototype.floaterFont = function () {
        return Math.max(9, Math.round(this.cell * 0.5)) + "px " + cssVar("--rp-font-pixel");
    };

    // Text box in cells: measured width plus room for the outline.
    Board.prototype.textSize = function (text, font) {
        var key = font + "|" + text;
        if (!this.sizes[key]) {
            this.ctx.save();
            this.ctx.font = font;
            var w = this.ctx.measureText(text).width;
            this.ctx.restore();
            this.sizes[key] = [(w + 4) / this.cell, (parseFloat(font) + 3) / this.cell];
        }
        return this.sizes[key];
    };

    // Boxes already on the board (tanks, placed text), in cells.
    function Placer() { this.taken = []; }

    Placer.prototype.add = function (x, y, w, h) {
        var b = {x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2};
        this.taken.push(b);
        return b;
    };

    // Put a w x h box at the cheapest of `spots` (offsets from x, y): least
    // overlap with what is already placed, then the earliest in the list.
    Placer.prototype.place = function (x, y, wh, spots) {
        var best = null, bestCost = Infinity;
        spots.forEach(function (o, n) {
            var x0 = x + o[0] - wh[0] / 2, y0 = y + o[1] - wh[1] / 2;
            var cost = n * 1e-3;
            this.taken.forEach(function (t) {
                var ox = Math.min(x0 + wh[0], t.x1) - Math.max(x0, t.x0);
                var oy = Math.min(y0 + wh[1], t.y1) - Math.max(y0, t.y0);
                if (ox > 0 && oy > 0) cost += ox * oy;
            });
            if (cost < bestCost) { bestCost = cost; best = o; }
        }, this);
        this.add(x + best[0], y + best[1], wh[0], wh[1]);
        return best;
    };

    // Label spots around a tank: above, below, beside, then the corners.
    Board.prototype.labelSpots = function (k) {
        var wh = this.textSize(this.styles[k].label, this.labelFont());
        var up = -0.5 - wh[1] / 2, r = 0.45 + wh[0] / 2;
        return [[0, up], [0, -up], [r, 0], [-r, 0], [r - 0.2, up], [0.2 - r, up], [r - 0.2, -up], [0.2 - r, -up]];
    };

    /*
     * Where the text around the tanks goes at the resting state of snapshot
     * i. Damage numbers sit to the upper right of their tank and labels above
     * it; when a spot is covered by another tank, label or number, the next
     * free side is used, so crowded tanks stay readable. Labels are offsets
     * from their tank, numbers are board positions (both in cells). Cached
     * per snapshot.
     */
    Board.prototype.layout = function (i) {
        if (this.layouts[i]) return this.layouts[i];
        var self = this, tanks = this.record[i].tanks, info = this.rounds[i];
        var placer = new Placer();
        var at = tanks.map(function (t, k) {
            var o = isDead(t) ? [0, 0] : spread(tanks, k);
            return [t.position[0] + o[0], t.position[1] + o[1]];
        });
        tanks.forEach(function (t, k) {
            if (!isDead(t)) placer.add(at[k][0], at[k][1], 0.9, 0.9);
        });
        // Items are softer obstacles: a label may cover one only if nothing
        // else is free.
        (this.record[i].items || []).forEach(function (it) {
            placer.add(it.position[0], it.position[1], 0.5, 0.5);
        });
        var font = this.floaterFont();
        var floaters = (info ? info.floaters : []).map(function (f) {
            var wh = self.textSize(f.text, font), r = 0.5 + wh[0] / 2, low = 0.75 - wh[1] / 2;
            var x = at[f.tank][0], y = at[f.tank][1];
            var o = placer.place(x, y, wh, [[r, -0.5], [r, low], [-r, -0.5], [-r, low],
                [0, -0.5 - wh[1]], [r, 1.1], [-r, 1.1]]);
            return [x + o[0], y + o[1]];
        });
        var labels = tanks.map(function (t, k) {
            return isDead(t) ? null : placer.place(at[k][0], at[k][1], self.textSize(self.styles[k].label,
                self.labelFont()), self.labelSpots(k));
        });
        this.layouts[i] = {labels: labels, floaters: floaters};
        return this.layouts[i];
    };

    // Labels mid-round: each keeps its interpolated spot unless that now
    // covers another tank, label or number (tanks driving into each other).
    Board.prototype.frameLabels = function (drawn, info, layout, p) {
        var self = this, placer = new Placer();
        drawn.forEach(function (d) { placer.add(d.x, d.y, 0.9, 0.9); });
        var font = this.floaterFont();
        if (info) info.floaters.forEach(function (f, n) {
            if (p < f.p) return;
            var wh = self.textSize(f.text, font), at = layout.floaters[n];
            placer.add(at[0], at[1], wh[0], wh[1]);
        });
        drawn.forEach(function (d) {
            var wh = self.textSize(self.styles[d.k].label, self.labelFont());
            var o = placer.place(d.x, d.y, wh, [d.o].concat(self.labelSpots(d.k)));
            d.lx = d.x + o[0];
            d.ly = d.y + o[1];
        });
    };

    /**
     * Draw the state between snapshot i-1 and i at progress p (0..1).
     * p === 1 is the resting state of round i.
     */
    Board.prototype.draw = function (i, p) {
        var ctx = this.ctx, cur = this.record[i], prev = i > 0 ? this.record[i - 1] : cur;
        var info = this.rounds[i];
        var e = reduceMotion ? 1 : ease(p);
        var now = reduceMotion ? 0 : performance.now();
        ctx.clearRect(0, 0, this.size, this.size);

        var z0 = zoneOf(prev), z1 = zoneOf(cur);
        this.drawZone({x0: lerp(z0.x0, z1.x0, e), y0: lerp(z0.y0, z1.y0, e), size: lerp(z0.size, z1.size, e)}, i);
        this.drawGrid();
        this.drawWalls();
        this.drawItems(i, p, now);

        var self = this;
        if (info) {
            info.bullets.forEach(function (b) { self.drawBullet(b, p); });
        } else {
            cur.bullets.forEach(function (b) {
                self.drawBullet({team: b.team !== undefined ? b.team : b.owner, owner: b.owner, dir: b.direction,
                    kind: "fly", from: b.position, stop: b.position, endAt: 1, speed: b.speed,
                    pathTrail: b.speed !== undefined, bounce: b.bounce > 0}, 1);
            });
        }

        // A tank that dies this round fades out as the round plays; after that
        // it is gone from the board (the HUD and the feed still record it).
        // Labels are drawn after all hulls so no tank covers another's label.
        var L1 = this.layout(i), L0 = i > 0 ? this.layout(i - 1) : L1;
        var labels = [];
        cur.tanks.forEach(function (t, k) {
            var from = prev.tanks[k];
            var dying = isDead(t);
            if (dying && (isDead(from) || p >= 1)) return;
            var o0 = i > 0 ? spread(prev.tanks, k) : spread(cur.tanks, k), o1 = spread(cur.tanks, k);
            var x = lerp(from.position[0], t.position[0], e) + lerp(o0[0], o1[0], e);
            var y = lerp(from.position[1], t.position[1], e) + lerp(o0[1], o1[1], e);
            var angle = lerpAngle(DIR_ANGLE[from.direction], DIR_ANGLE[t.direction], e);
            // Pushed back: turn and nose forward first, then back off a cell,
            // still facing the way it turned.
            var push = info && p < 1 && !reduceMotion ? info.pushes.filter(function (c) { return c.tank === k; })[0] : null;
            if (push) {
                var q = pushOffset(p);
                x = from.position[0] + DIR[push.dir][0] * q + lerp(o0[0], o1[0], e);
                y = from.position[1] + DIR[push.dir][1] * q + lerp(o0[1], o1[1], e);
                angle = lerpAngle(DIR_ANGLE[from.direction], DIR_ANGLE[push.dir], ease(clamp(p / PUSH_HIT, 0, 1)));
            }
            var flash = 0;
            if (info && !reduceMotion) {
                info.flashes.forEach(function (f) {
                    if (f.tank === k && p >= f.p) flash = Math.max(flash, f.strength * (1 - (p - f.p) / f.dur));
                });
            }
            var alpha = dying ? (reduceMotion ? 0 : clamp((1 - p) / 0.4, 0, 1)) : 1;
            ctx.save();
            ctx.globalAlpha = alpha;
            // A two-cell (speed) move leaves streaks behind the tank.
            if (p < 1 && !reduceMotion && cellDist(from.position, t.position) >= 2) {
                self.drawStreak(x, y, [Math.sign(t.position[0] - from.position[0]),
                    Math.sign(t.position[1] - from.position[1])], p);
            }
            self.drawTank(k, x, y, angle, clamp(flash, 0, 1), self.statusAt(i, k, p), now);
            ctx.restore();
            var a = L0.labels[k] || L1.labels[k], b = L1.labels[k] || a;
            var o = [lerp(a[0], b[0], e), lerp(a[1], b[1], e)];
            labels.push({k: k, x: x, y: y, o: o, lx: x + o[0], ly: y + o[1], alpha: alpha});
        });
        if (p < 1 && !reduceMotion) this.frameLabels(labels, info, L1, p);
        labels.forEach(function (l) { self.drawLabel(l.k, l.lx, l.ly, l.alpha); });

        if (info) this.drawEffects(info, L1, p);
    };

    // Whether snapshot i has anything with an idle animation (items, jammed
    // tanks), so a paused board keeps being redrawn.
    Board.prototype.animated = function (i) {
        var snap = this.record[i];
        return !!((snap.items && snap.items.length) ||
            snap.tanks.some(function (t) { return !isDead(t) && t.jam > 0; }));
    };

    // Shield / jam / buffs of tank k at progress p of round i: the previous
    // snapshot's state plus this round's changes so far; the new snapshot at rest.
    Board.prototype.statusAt = function (i, k, p) {
        var info = this.rounds[i];
        var live = info && p < 1;
        var src = live ? this.record[i - 1].tanks[k] : this.record[i].tanks[k];
        var st = {shield: !!src.shield, jam: src.jam > 0, buffs: {}};
        BUFFS.forEach(function (b) { st.buffs[b] = !!(src.buffs && src.buffs[b] > 0); });
        if (live) {
            info.status.forEach(function (c) {
                if (c.tank !== k || p < c.p) return;
                if (c.set.shield !== undefined) st.shield = !!c.set.shield;
                if (c.set.jam) st.jam = true;
                if (c.set.buff) st.buffs[c.set.buff] = true;
            });
        }
        return st;
    };

    /*
     * The safe square z (interpolated while it closes), hatched danger all
     * around it. Three rounds before it closes, the band that is about to
     * go is tinted. v5 records know where the next zone is (it can drift
     * off-centre), so its outline is always shown: faint, then bright
     * while it is about to close.
     */
    Board.prototype.drawZone = function (z, i) {
        var ctx = this.ctx, c = this.colors, s = this.cell, snap = this.record[i];
        // Everything outside the safe zone is hazardous.
        ctx.fillStyle = this.hatch;
        ctx.fillRect(0, 0, this.size, this.size);

        var every = this.zoneEvery;
        var soon = (Math.floor(i / every) + 1) * every - i <= 3;
        var sh = snap.shrink;
        var next = snap.nextZone || (snap.zone ? null : {x0: sh + 1, y0: sh + 1, size: MAP - 2 * sh - 2});
        var X = this.px(z.x0), Y = this.px(z.y0), size = z.size * s;
        if (size > 0) {
            ctx.fillStyle = c.paper;
            ctx.fillRect(X, Y, size, size);
            if (soon && next && zoneOf(snap).size > 0) {
                var nX = this.px(next.x0), nY = this.px(next.y0), nSize = Math.max(0, next.size) * s;
                ctx.save();
                ctx.globalAlpha = 0.55;
                ctx.fillStyle = c.dangerTint;
                ctx.beginPath();
                ctx.rect(X, Y, size, size);
                ctx.rect(nX + nSize, nY, -nSize, nSize); // hole
                ctx.fill();
                ctx.restore();
            }
        }

        // The map outside [0, 20) is off the arena itself.
        ctx.save();
        ctx.fillStyle = c.outside;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.rect(0, 0, this.size, this.size);
        ctx.rect(this.px(MAP), this.px(0), -MAP * s, MAP * s);
        ctx.fill();
        ctx.restore();

        if (size > 0) {
            ctx.save();
            ctx.strokeStyle = c.danger;
            ctx.lineWidth = 2;
            ctx.setLineDash([s * 0.4, s * 0.2]);
            ctx.strokeRect(X + 1, Y + 1, size - 2, size - 2);
            ctx.restore();
        }

        if (snap.nextZone && next.size > 0) {
            var q = Math.round(this.px(next.x0)) + 0.5, r = Math.round(this.px(next.y0)) + 0.5;
            var w = Math.round(next.size * s) - 1;
            ctx.save();
            ctx.strokeStyle = c.next;
            ctx.globalAlpha = soon ? 0.9 : 0.4;
            ctx.lineWidth = soon ? 1.5 : 1;
            ctx.strokeRect(q, r, w, w);
            // Corner brackets: the "target" of the closing zone.
            var L = Math.min(w / 2, Math.max(4, s * 0.7));
            ctx.lineWidth = soon ? 2.5 : 2;
            ctx.beginPath();
            [[q, r, 1, 1], [q + w, r, -1, 1], [q, r + w, 1, -1], [q + w, r + w, -1, -1]].forEach(function (k) {
                ctx.moveTo(k[0] + k[2] * L, k[1]); ctx.lineTo(k[0], k[1]); ctx.lineTo(k[0], k[1] + k[3] * L);
            });
            ctx.stroke();
            ctx.restore();
        }
    };

    /*
     * Items. At rest the snapshot's items; mid-round the ones the round
     * describes: a new drop falls in and lands with a ring, a pickup swells
     * and fades into the tank, and the closing zone dissolves the ones it
     * swallows.
     */
    Board.prototype.drawItems = function (i, p, now) {
        var info = this.rounds[i], self = this;
        if (!info || p >= 1) {
            (this.record[i].items || []).forEach(function (it) {
                self.drawItem(itemType(it.type), it.position[0], it.position[1], 1, 1, now, it.id);
            });
            return;
        }
        info.items.forEach(function (it) {
            var scale = 1, alpha = 1, dy = 0, t;
            if (it.enter === "spawn") {
                if (p < it.p) return;
                t = reduceMotion ? 1 : clamp((p - it.p) / 0.3, 0, 1);
                dy = -0.8 * (1 - t) * (1 - t);
                alpha = clamp(t * 2.5, 0, 1);
                scale = 0.7 + 0.3 * t;
            } else if (it.exit && p >= it.p) {
                t = (p - it.p) / (it.exit === "pickup" ? 0.3 : 0.25);
                if (t >= 1 || reduceMotion) return;
                alpha = 1 - t;
                scale = it.exit === "pickup" ? 1 + 0.6 * t : 1 - 0.5 * t;
            }
            self.drawItem(it.type, it.at[0], it.at[1] + dy, scale, alpha, now, it.id);
        });
    };

    // One item: a dark tile with its glyph, breathing a soft glow in its colour.
    Board.prototype.drawItem = function (type, x, y, scale, alpha, now, id) {
        var ctx = this.ctx, s = this.cell, c = this.colors, col = c[type] || c.ink;
        var r = s * 0.34 * scale;
        var glow = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(now / 480 + (id || 0) * 1.7);
        ctx.save();
        ctx.translate(this.cx(x), this.cx(y));
        ctx.globalAlpha = alpha;
        ctx.shadowColor = col;
        ctx.shadowBlur = s * (0.2 + 0.4 * glow);
        roundRect(ctx, -r, -r, 2 * r, 2 * r, r * 0.35);
        ctx.fillStyle = c.itemTile;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = Math.max(1, s * 0.05);
        ctx.strokeStyle = col;
        ctx.globalAlpha = alpha * (0.45 + 0.35 * glow);
        ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = col;
        var g = this.glyphs[type];
        if (g) {
            var k = r * 1.5 / 16;
            ctx.scale(k, k);
            ctx.translate(-8, -8);
            ctx.fill(g, "evenodd");
        } else {
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    };

    // Motion streaks behind a tank covering two cells in one move.
    Board.prototype.drawStreak = function (x, y, d, p) {
        var ctx = this.ctx, s = this.cell, X = this.cx(x), Y = this.cx(y);
        ctx.save();
        ctx.strokeStyle = this.colors.speed;
        ctx.lineWidth = Math.max(1, s * 0.06);
        ctx.lineCap = "round";
        ctx.globalAlpha *= 0.75 * (1 - p);
        ctx.beginPath();
        [-0.28, 0, 0.28].forEach(function (o, n) {
            var back = 0.55 + (n === 1 ? 0.2 : 0), len = n === 1 ? 1.1 : 0.75;
            var ox = -d[1] * o * s, oy = d[0] * o * s;
            ctx.moveTo(X - d[0] * back * s + ox, Y - d[1] * back * s + oy);
            ctx.lineTo(X - d[0] * (back + len) * s + ox, Y - d[1] * (back + len) * s + oy);
        });
        ctx.stroke();
        ctx.restore();
    };

    Board.prototype.drawGrid = function () {
        var ctx = this.ctx, s = this.cell, c = this.colors;
        var a = this.px(0), b = this.px(MAP);
        ctx.save();
        ctx.strokeStyle = c.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var v = 1; v < MAP; v++) {
            var q = Math.round(this.px(v)) + 0.5;
            ctx.moveTo(q, a); ctx.lineTo(q, b);
            ctx.moveTo(a, q); ctx.lineTo(b, q);
        }
        ctx.stroke();
        ctx.strokeStyle = c.muted;
        ctx.strokeRect(Math.round(a) + 0.5, Math.round(a) + 0.5, Math.round(b - a), Math.round(b - a));

        // Coordinates along the top and left edges, every 5 cells.
        ctx.fillStyle = c.muted;
        ctx.font = Math.max(8, Math.round(s * 0.42)) + "px " + cssVar("--rp-font-mono");
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // The outermost ring is never inside the safe zone, so labels there
        // never collide with the zone line.
        var edge = this.cx(this.lo);
        [0, 5, 10, 15, 19].forEach(function (v) {
            ctx.fillText(String(v), this.cx(v), edge);
            ctx.fillText(String(v), edge, this.cx(v));
        }, this);
        ctx.restore();
    };

    /*
     * Walls are raised blocks seen slightly from the south: a lit top face,
     * a darker front face and a short shadow on the floor. Neighbouring
     * cells merge into one barrier because only exposed edges are drawn.
     */
    Board.prototype.drawWalls = function () {
        if (!this.walls.length) return;
        var ctx = this.ctx, s = this.cell, c = this.colors, set = this.wallSet;
        var has = function (x, y) { return !!set[x + "," + y]; };
        var lip = Math.max(2, s * 0.2);
        ctx.save();
        // Shadows cast onto the floor (south-east).
        ctx.fillStyle = "rgba(0, 0, 0, .35)";
        this.walls.forEach(function (w) {
            var X = this.px(w[0]), Y = this.px(w[1]);
            if (!has(w[0], w[1] + 1)) ctx.fillRect(X + s * 0.12, Y + s, s, s * 0.16);
            if (!has(w[0] + 1, w[1])) ctx.fillRect(X + s, Y + s * 0.12, s * 0.12, s);
        }, this);
        // Top face, with the front face showing as a darker lip at the bottom.
        // A wall to the south continues the top face, so a column reads as
        // one block.
        var top = function (w) { return has(w[0], w[1] + 1) ? s : s - lip; };
        this.walls.forEach(function (w) {
            var X = this.px(w[0]), Y = this.px(w[1]);
            ctx.fillStyle = c.wallSide;
            ctx.fillRect(X, Y, s, s);
            ctx.fillStyle = c.wallTop;
            ctx.fillRect(X, Y, s, top(w));
        }, this);
        // Lit edges on the top face.
        ctx.fillStyle = c.wallEdge;
        this.walls.forEach(function (w) {
            var X = this.px(w[0]), Y = this.px(w[1]);
            if (!has(w[0], w[1] - 1)) ctx.fillRect(X, Y, s, 1.5);
            if (!has(w[0] - 1, w[1])) ctx.fillRect(X, Y, 1.5, top(w));
        }, this);
        // Joints between blocks of the same barrier.
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = c.wallSide;
        this.walls.forEach(function (w) {
            var X = this.px(w[0]), Y = this.px(w[1]);
            if (has(w[0], w[1] - 1)) ctx.fillRect(X + s * 0.12, Y - 0.5, s * 0.76, 1);
            if (has(w[0] - 1, w[1])) ctx.fillRect(X - 0.5, Y + s * 0.12, 1, top(w) - s * 0.24);
        }, this);
        ctx.restore();
    };

    Board.prototype.drawTank = function (k, x, y, angle, flash, st, now) {
        var ctx = this.ctx, s = this.cell;
        var style = this.styles[k];
        var color = this.color(style.team);
        var jam = !!(st && st.jam);
        ctx.save();
        ctx.translate(this.cx(x), this.cx(y));
        ctx.save();
        ctx.rotate(angle);

        if (style.shape === "classic") this.drawClassicHull(style, color);
        else this.drawTeamHull(style.shape, color, !jam, jam);
        if (jam) this.drawStatic(k, now);
        if (flash > 0) {
            ctx.globalAlpha *= flash * 0.85;
            ctx.fillStyle = "#fff";
            ctx.fillRect(-s * 0.46, -s * 0.46, s * 0.92, s * 0.92);
        }
        ctx.restore();
        if (st) this.drawStatus(st);
        ctx.restore();
    };

    /*
     * Tank state around the hull (origin at the tank centre): active buffs
     * as four short arcs, one fixed corner each (wide top-left, rapid
     * top-right, bounce bottom-right, speed bottom-left), and the shield
     * as a bubble around it all.
     */
    var BUFF_ANGLE = {wide: -0.75 * Math.PI, rapid: -0.25 * Math.PI, bounce: 0.25 * Math.PI, speed: 0.75 * Math.PI};

    Board.prototype.drawStatus = function (st) {
        var ctx = this.ctx, s = this.cell, c = this.colors;
        var on = BUFFS.filter(function (b) { return st.buffs[b]; });
        if (on.length) {
            var R = s * 0.6, lw = Math.max(1.5, s * 0.08), half = Math.PI * 0.17;
            ctx.save();
            ctx.lineCap = "round";
            on.forEach(function (b) {
                ctx.beginPath();
                ctx.arc(0, 0, R, BUFF_ANGLE[b] - half, BUFF_ANGLE[b] + half);
                ctx.strokeStyle = c.tread;
                ctx.lineWidth = lw + 2;
                ctx.stroke();
                ctx.strokeStyle = c[b];
                ctx.lineWidth = lw;
                ctx.stroke();
            });
            ctx.restore();
        }
        if (st.shield) {
            var r = s * 0.74;
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.fillStyle = withAlpha(c.shield, 0.13);
            ctx.fill();
            ctx.strokeStyle = c.shield;
            ctx.globalAlpha *= 0.9;
            ctx.lineWidth = Math.max(1.25, s * 0.06);
            ctx.stroke();
            // Glint, so it reads as a bubble rather than a ring.
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.78, -0.9 * Math.PI, -0.62 * Math.PI);
            ctx.strokeStyle = "#fff";
            ctx.globalAlpha *= 0.55;
            ctx.lineCap = "round";
            ctx.stroke();
            ctx.restore();
        }
    };

    // Jammed: flickering static across the hull (rotated with it).
    Board.prototype.drawStatic = function (k, now) {
        var ctx = this.ctx, s = this.cell;
        var seed = Math.floor(now / 90) * 7 + k * 131;
        var rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        ctx.save();
        ctx.fillStyle = this.colors.jam;
        for (var n = 0; n < 4; n++) {
            var y = (rnd() - 0.5) * s * 0.7, w = s * (0.18 + rnd() * 0.3), x = (rnd() - 0.5) * s * 0.6;
            ctx.globalAlpha = 0.45 + rnd() * 0.45;
            ctx.fillRect(x - w / 2, y, w, Math.max(1, s * 0.05));
        }
        ctx.restore();
    };

    // Tank label centred on (x, y) in cells, so tanks stay distinguishable
    // even with custom skins. Placement comes from layout().
    Board.prototype.drawLabel = function (k, x, y, alpha) {
        var ctx = this.ctx, style = this.styles[k];
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = this.labelFont();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.strokeStyle = this.colors.paper;
        ctx.fillStyle = this.color(style.team);
        ctx.strokeText(style.label, this.cx(x), this.cx(y));
        ctx.fillText(style.label, this.cx(x), this.cx(y));
        ctx.restore();
    };

    // The original tank (or the player's skin), facing +x.
    Board.prototype.drawClassicHull = function (style, color) {
        var ctx = this.ctx, s = this.cell, c = this.colors;
        var skin = style.skin;
        if (skin) {
            // Skins are drawn facing up, like the profile preview.
            ctx.rotate(Math.PI / 2);
            var r = Math.min(0.92 * s / skin.width, 0.92 * s / skin.height);
            ctx.drawImage(skin, -skin.width * r / 2, -skin.height * r / 2, skin.width * r, skin.height * r);
            return;
        }
        var L = s * 0.84, W = s * 0.74, tw = s * 0.17;
        ctx.fillStyle = c.tread;
        roundRect(ctx, -L / 2, -W / 2, L, tw, tw / 2); ctx.fill();
        roundRect(ctx, -L / 2, W / 2 - tw, L, tw, tw / 2); ctx.fill();
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = s * 0.6;
        roundRect(ctx, -L * 0.42, -W / 2 + tw * 0.75, L * 0.84, W - tw * 1.5, s * 0.1); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = c.tread;
        ctx.fillRect(0, -s * 0.06, s * 0.56, s * 0.12); // barrel
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.19, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.1, 0, Math.PI * 2);
        ctx.fill();
    };

    /*
     * v4 hulls, facing +x. Heavy: a broad square box on wide treads, square
     * turret, thick short barrel with a muzzle brake. Striker: a narrow dart
     * with a small round turret and a long thin barrel. The HUD icons
     * (#rp-icon-*) use the same silhouettes.
     */
    Board.prototype.drawTeamHull = function (shape, color, glow, jam) {
        var ctx = this.ctx, s = this.cell, c = this.colors;
        // A jammed tank's gun is greyed out and its body dimmed.
        var gun = jam ? c.jam : c.tread;
        var dim = jam ? 0.6 : 1;
        if (shape === "heavy") {
            var L = s * 0.9, W = s * 0.9, tw = s * 0.2;
            // Treads in a dim team tint, so the wide footprint shows on the
            // dark floor.
            ctx.fillStyle = c.tread;
            ctx.fillRect(-L / 2, -W / 2, L, tw);
            ctx.fillRect(-L / 2, W / 2 - tw, L, tw);
            ctx.globalAlpha *= 0.45;
            ctx.fillStyle = color;
            for (var k = 0; k < 4; k++) {
                ctx.fillRect(-L / 2 + k * L / 4 + s * 0.02, -W / 2 + s * 0.03, L / 4 - s * 0.04, tw - s * 0.06);
                ctx.fillRect(-L / 2 + k * L / 4 + s * 0.02, W / 2 - tw + s * 0.03, L / 4 - s * 0.04, tw - s * 0.06);
            }
            ctx.globalAlpha /= 0.45;
            ctx.fillStyle = color;
            if (glow) { ctx.shadowColor = color; ctx.shadowBlur = s * 0.6; }
            ctx.globalAlpha *= dim;
            ctx.fillRect(-L * 0.44, -W / 2 + tw * 0.8, L * 0.86, W - tw * 1.6);
            ctx.globalAlpha /= dim;
            ctx.shadowBlur = 0;
            ctx.fillStyle = gun;
            ctx.fillRect(0, -s * 0.1, s * 0.48, s * 0.2);          // thick barrel
            ctx.fillRect(s * 0.4, -s * 0.14, s * 0.14, s * 0.28);  // muzzle brake
            ctx.fillStyle = c.tread;
            ctx.fillRect(-s * 0.21, -s * 0.21, s * 0.4, s * 0.42); // square turret
            ctx.fillStyle = color;
            ctx.fillRect(-s * 0.11, -s * 0.1, s * 0.19, s * 0.2);
            return;
        }
        var l = s * 0.86, w = s * 0.64;
        ctx.fillStyle = color;
        if (glow) { ctx.shadowColor = color; ctx.shadowBlur = s * 0.5; }
        ctx.globalAlpha *= dim;
        ctx.beginPath();
        ctx.moveTo(l * 0.36, 0);
        ctx.lineTo(-l * 0.5, -w / 2);
        ctx.lineTo(-l * 0.3, 0);
        ctx.lineTo(-l * 0.5, w / 2);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha /= dim;
        ctx.shadowBlur = 0;
        ctx.fillStyle = gun;
        ctx.fillRect(-s * 0.05, -s * 0.04, s * 0.61, s * 0.08);   // long thin barrel
        ctx.fillStyle = c.tread;
        ctx.beginPath();
        ctx.arc(-s * 0.1, 0, s * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(-s * 0.1, 0, s * 0.06, 0, Math.PI * 2);
        ctx.fill();
    };

    Board.prototype.drawBullet = function (b, p) {
        if (b.kind === "absorbed") return; // only its spark is drawn
        var ctx = this.ctx, s = this.cell, c = this.colors;
        var t = reduceMotion ? 1 : p;
        var alpha = 1;
        if (b.kind === "out") {
            if (t >= 1) return;
            alpha = 1 - t;
        } else if (b.kind !== "fly") {
            if (t >= b.endAt) return;
        }
        // Where it is now, and the way back along this round's path (a
        // ricochet folds the path at the wall face).
        var track = b.track || [{at: b.from, q: 0, dir: b.dir}, {at: b.stop, q: b.endAt, dir: b.dir}];
        var tt = Math.min(t, track[track.length - 1].q), n = 0;
        while (n < track.length - 2 && track[n + 1].q <= tt) n++;
        var k0 = track[n], k1 = track[n + 1];
        var f = k1.q > k0.q ? clamp((tt - k0.q) / (k1.q - k0.q), 0, 1) : 1;
        var x = lerp(k0.at[0], k1.at[0], f), y = lerp(k0.at[1], k1.at[1], f);
        var dir = b.track && t < 1 ? k0.dir : b.dir;
        var color = this.color(b.team);
        var X = this.cx(x), Y = this.cx(y);
        var moving = t < 1 && !reduceMotion;
        var back = [[x, y]], travelled = 0;
        for (var m = n; m >= 0; m--) {
            var last = back[back.length - 1];
            travelled += Math.abs(last[0] - track[m].at[0]) + Math.abs(last[1] - track[m].at[1]);
            back.push(track[m].at);
        }

        ctx.save();
        ctx.globalAlpha = alpha;
        var trail;
        if (b.pathTrail) {
            // Streak back along this round's path; at rest its length hints
            // at the bullet's speed.
            trail = moving ? travelled + 0.6 : 0.5 + 0.3 * (b.speed || 2);
        } else {
            // Trail: longer while the bullet is moving.
            trail = moving ? 1.6 : 0.9;
        }
        // Past the start of the path the streak continues straight back.
        var d0 = track[0].dir, first = back[back.length - 1];
        back.push([first[0] - DIR[d0][0] * trail, first[1] - DIR[d0][1] * trail]);
        ctx.lineWidth = s * 0.14;
        ctx.lineCap = "round";
        ctx.globalAlpha = alpha * 0.55;
        for (var j = 0, done = 0; j < back.length - 1 && done < trail; j++) {
            var A = back[j], B = back[j + 1];
            var len = Math.abs(B[0] - A[0]) + Math.abs(B[1] - A[1]);
            if (len <= 0) continue;
            var use = Math.min(len, trail - done), u = use / len;
            var ax = this.cx(A[0]), ay = this.cx(A[1]);
            var bx = this.cx(lerp(A[0], B[0], u)), by = this.cx(lerp(A[1], B[1], u));
            var grad = ctx.createLinearGradient(ax, ay, bx, by);
            grad.addColorStop(0, withAlpha(color, 1 - done / trail));
            grad.addColorStop(1, withAlpha(color, 1 - (done + use) / trail));
            ctx.strokeStyle = grad;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
            done += use;
        }
        ctx.globalAlpha = alpha;

        // A shell that can still ricochet wears a ring in the bounce colour.
        if (b.bounce && (b.bounceAt === undefined || tt < b.bounceAt)) {
            ctx.beginPath();
            ctx.arc(X, Y, s * 0.24, 0, Math.PI * 2);
            ctx.strokeStyle = c.bounce;
            ctx.lineWidth = Math.max(1, s * 0.05);
            ctx.stroke();
        }

        var skin = this.rules.bulletSkin(this.skins, b);
        ctx.translate(X, Y);
        ctx.rotate(DIR_ANGLE[dir]);
        if (skin) {
            ctx.rotate(Math.PI / 2);
            var r = Math.min(0.5 * s / skin.width, 0.5 * s / skin.height);
            ctx.drawImage(skin, -skin.width * r / 2, -skin.height * r / 2, skin.width * r, skin.height * r);
        } else {
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = s * 0.5;
            roundRect(ctx, -s * 0.2, -s * 0.09, s * 0.4, s * 0.18, s * 0.09);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = c.paper;
            ctx.fillRect(s * 0.02, -s * 0.03, s * 0.12, s * 0.06);
        }
        ctx.restore();
    };

    Board.prototype.drawEffects = function (info, layout, p) {
        var self = this;
        var local = function (cue) { return reduceMotion ? 1 : clamp((p - cue.p) / cue.dur, 0, 1); };
        info.bursts.forEach(function (b) {
            if (p < b.p) return;
            var t = local(b);
            // Bursts belong to the motion only: none at rest, even if cut short.
            if (p >= 1 || t >= 1 || reduceMotion) return;
            self.burst(b.at[0], b.at[1], t, b.scale, self.color(b.color));
        });
        // A shield taking a shot shatters: violet shards, no damage number.
        info.blocks.forEach(function (b) {
            var t = (p - b.p) / 0.45;
            if (p < b.p || p >= 1 || t >= 1 || reduceMotion) return;
            self.shatter(b.at[0], b.at[1], t);
        });
        info.pushes.forEach(function (c) {
            var t = (p - c.p) / 0.3;
            if (p < c.p || p >= 1 || t >= 1 || reduceMotion) return;
            self.bump(c.edge, c.dir, t);
        });
        info.floaters.forEach(function (f, n) {
            if (p < f.p) return;
            self.floater(f.text, layout.floaters[n], local(f), self.color(f.color));
        });
    };

    // Hexagonal ring breaking into shards that spin outwards.
    Board.prototype.shatter = function (x, y, t) {
        var ctx = this.ctx, s = this.cell, col = this.colors.shield;
        var X = this.cx(x), Y = this.cx(y), R = s * (0.74 + 0.3 * t);
        ctx.save();
        ctx.translate(X, Y);
        ctx.strokeStyle = col;
        ctx.fillStyle = col;
        ctx.globalAlpha = 1 - t;
        ctx.lineWidth = Math.max(1.5, s * 0.1 * (1 - t));
        ctx.beginPath();
        for (var k = 0; k <= 6; k++) {
            var a = k * Math.PI / 3 + Math.PI / 6;
            if (k === 0) ctx.moveTo(Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85);
            else ctx.lineTo(Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85);
        }
        ctx.stroke();
        var q = s * 0.16 * (1 - t * 0.5);
        for (var n = 0; n < 6; n++) {
            var b = n * Math.PI / 3, d = R * (0.9 + 0.5 * t);
            ctx.save();
            ctx.translate(Math.cos(b) * d, Math.sin(b) * d);
            ctx.rotate(b + t * 2.5);
            ctx.beginPath();
            ctx.moveTo(-q, -q * 0.5); ctx.lineTo(q, 0); ctx.lineTo(-q, q * 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    };

    // Push back: a short tick along the edge the tank ran into, with two
    // chips glancing off it. No ring and no red: nobody is hurt.
    Board.prototype.bump = function (at, dir, t) {
        var ctx = this.ctx, s = this.cell, d = DIR[dir], n = [-d[1], d[0]];
        var X = this.cx(at[0]), Y = this.cx(at[1]), h = s * (0.18 + 0.06 * t);
        ctx.save();
        ctx.globalAlpha = 0.8 * (1 - t);
        ctx.strokeStyle = this.colors.ink;
        ctx.lineCap = "round";
        ctx.lineWidth = Math.max(1, s * 0.06 * (1 - 0.5 * t));
        ctx.beginPath();
        ctx.moveTo(X - n[0] * h, Y - n[1] * h);
        ctx.lineTo(X + n[0] * h, Y + n[1] * h);
        [-1, 1].forEach(function (side) {
            var v = [n[0] * side * 0.8 - d[0] * 0.6, n[1] * side * 0.8 - d[1] * 0.6];
            var r0 = s * (0.12 + 0.18 * t), r1 = r0 + s * 0.08;
            ctx.moveTo(X + v[0] * r0, Y + v[1] * r0);
            ctx.lineTo(X + v[0] * r1, Y + v[1] * r1);
        });
        ctx.stroke();
        ctx.restore();
    };

    // Expanding ring plus square "pixel" debris.
    Board.prototype.burst = function (x, y, t, scale, color) {
        var ctx = this.ctx, s = this.cell;
        var X = this.cx(x), Y = this.cx(y);
        ctx.save();
        ctx.globalAlpha = 1 - t * 0.75;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.5, s * 0.1 * (1 - t) + 1);
        ctx.beginPath();
        ctx.arc(X, Y, s * scale * (0.25 + 0.55 * t), 0, Math.PI * 2);
        ctx.stroke();
        if (t < 1) {
            ctx.fillStyle = color;
            var d = s * scale * (0.3 + 0.7 * t), q = s * 0.14 * (1 - t);
            for (var k = 0; k < 8; k++) {
                var a = k * Math.PI / 4 + 0.4;
                ctx.fillRect(X + Math.cos(a) * d - q / 2, Y + Math.sin(a) * d - q / 2, q, q);
            }
        }
        ctx.restore();
    };

    // Damage number rising into its resting spot `at` (from layout()).
    Board.prototype.floater = function (text, at, t, color) {
        var ctx = this.ctx;
        ctx.save();
        ctx.font = this.floaterFont();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = t < 1 ? 1 : 0.9;
        var X = this.cx(at[0]), Y = this.cx(at[1] + 0.3 * (1 - t));
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.strokeStyle = this.colors.paper;
        ctx.strokeText(text, X, Y);
        ctx.fillStyle = color;
        ctx.fillText(text, X, Y);
        ctx.restore();
    };

    // "#rrggbb" at alpha a, for gradients that fade out without drifting
    // towards white or black.
    function withAlpha(hex, a) {
        if (!/^#[0-9a-f]{6}$/i.test(hex)) return a > 0.5 ? hex : "rgba(0,0,0,0)";
        var v = parseInt(hex.slice(1), 16);
        return "rgba(" + (v >> 16) + "," + (v >> 8 & 255) + "," + (v & 255) + "," + clamp(a, 0, 1).toFixed(3) + ")";
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    /* ------------------------------------------------------------------ *
     * Timeline "tape": both teams' life curves mirrored around the centre
     * line, with hit, kill and zone markers. A native range input sits on
     * top.
     * ------------------------------------------------------------------ */

    function Tape(canvas, record, rounds, rules, colors) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.record = record;
        this.rounds = rounds;
        this.colors = colors;
        this.life = [0, 1].map(function (team) {
            return record.map(function (s) { return rules.teamLife(s, team); });
        });
        this.max = [0, 1].map(function (team) { return Math.max(1, rules.teamMax(record, team)); });
    }

    Tape.prototype.resize = function () {
        var rect = this.canvas.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        this.w = rect.width;
        this.h = rect.height;
        this.canvas.width = Math.round(rect.width * dpr);
        this.canvas.height = Math.round(rect.height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.pad = 8; // matches the range thumb's half width
    };

    Tape.prototype.x = function (i) {
        var n = Math.max(1, this.record.length - 1);
        return this.pad + (this.w - 2 * this.pad) * i / n;
    };

    Tape.prototype.draw = function (t) {
        var ctx = this.ctx, c = this.colors, w = this.w, h = this.h, mid = h / 2, self = this;
        var amp = mid - 6;
        ctx.clearRect(0, 0, w, h);

        // Zone closing ticks.
        ctx.save();
        ctx.strokeStyle = c.danger;
        ctx.globalAlpha = 0.45;
        ctx.setLineDash([2, 3]);
        this.rounds.forEach(function (r, i) {
            if (!r || !r.zone || i === 1) return;
            var x = Math.round(self.x(i)) + 0.5;
            ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x, h - 2); ctx.stroke();
        });
        ctx.restore();

        // Life curves: A above the centre line, B below.
        [0, 1].forEach(function (k) {
            var sign = k === 0 ? -1 : 1, life = self.life[k], max = self.max[k];
            var yAt = function (i) { return mid + sign * amp * clamp(life[i], 0, max) / max; };
            ctx.beginPath();
            ctx.moveTo(self.x(0), mid);
            life.forEach(function (v, i) {
                if (i > 0) ctx.lineTo(self.x(i), yAt(i - 1));
                ctx.lineTo(self.x(i), yAt(i));
            });
            ctx.lineTo(self.x(life.length - 1), mid);
            ctx.closePath();
            ctx.fillStyle = k === 0 ? c.aSoft : c.bSoft;
            ctx.fill();
        });
        ctx.fillStyle = c.grid;
        ctx.fillRect(this.pad, Math.round(mid) - 0.5, w - 2 * this.pad, 1);

        // Hits as small dots on the victim's edge, in the shooter's colour;
        // collisions on the centre line. Kills are drawn last and biggest: a
        // bold cross in the fallen team's colour, inside its half of the
        // tape so it clears the hit dots; two kills in a round sit side by
        // side.
        var kills = [];
        this.rounds.forEach(function (r, i) {
            if (!r) return;
            var x = self.x(i), n = [0, 0];
            r.marks.forEach(function (m) {
                var y = m.side === 0 ? 5 : h - 5;
                if (m.kind === "hit") {
                    ctx.beginPath();
                    ctx.arc(x, y, 3, 0, Math.PI * 2);
                    ctx.fillStyle = m.team === 0 ? c.a : c.b;
                    ctx.fill();
                } else if (m.kind === "pickup") {
                    // Short tick off the centre line, on the picker's side.
                    var dy = m.side === 0 ? -1 : 1;
                    ctx.fillStyle = c.outline;
                    ctx.fillRect(Math.round(x) - 1.5, dy < 0 ? mid - 8.5 : mid + 1.5, 3, 7);
                    ctx.fillStyle = m.team === 0 ? c.a : c.b;
                    ctx.fillRect(Math.round(x) - 0.75, dy < 0 ? mid - 7.5 : mid + 2.5, 1.5, 5);
                } else if (m.kind === "crash") {
                    ctx.fillStyle = c.ink;
                    ctx.fillRect(x - 3, mid - 3, 6, 6);
                } else if (m.kind === "kill") {
                    kills.push({x: x, side: m.side, n: n[m.side]++, of: n});
                }
            });
        });

        // Unplayed part is washed out; the playhead is a solid line.
        var px = this.x(t);
        ctx.fillStyle = c.wash;
        ctx.fillRect(px, 0, w - px, h);
        ctx.save();
        ctx.fillStyle = c.gold;
        ctx.shadowColor = c.gold;
        ctx.shadowBlur = 8;
        ctx.fillRect(Math.round(px) - 1, 0, 2, h);
        ctx.restore();

        // Kills go on top of the playhead so the one just reached stays
        // visible; unplayed ones are dimmed like the wash.
        ctx.save();
        ctx.lineCap = "round";
        kills.forEach(function (k) {
            var x = k.x + (k.n - (k.of[k.side] - 1) / 2) * 8, d = 3.75;
            var y = mid + (k.side === 0 ? -1 : 1) * amp * 0.5;
            ctx.globalAlpha = k.x > px + 0.5 ? 0.45 : 1;
            ctx.beginPath();
            ctx.moveTo(x - d, y - d); ctx.lineTo(x + d, y + d);
            ctx.moveTo(x + d, y - d); ctx.lineTo(x - d, y + d);
            ctx.strokeStyle = c.outline;
            ctx.lineWidth = 5.5;
            ctx.stroke();
            ctx.strokeStyle = k.side === 0 ? c.a : c.b;
            ctx.lineWidth = 2.5;
            ctx.stroke();
        });
        ctx.restore();
    };

    /* ------------------------------------------------------------------ *
     * Player: playback state and UI wiring
     * ------------------------------------------------------------------ */

    function Player(data) {
        this.data = data;
        this.record = data.record;
        var v = this.record[0].v;
        this.rules = v === 5 ? ITEMS : v === 4 ? TEAMS : CLASSIC;
        this.n = this.record.length - 1;
        this.rounds = this.rules.analyze(this.record);
        this.names = [data.p1, data.p2];
        this.t = 0;              // playback position in rounds (float)
        this.playing = false;
        this.speed = 1;
        this.tween = null;       // {to} for single steps
        this.lastRound = -1;
        this.lastFrame = 0;

        var skins = {tank: [null, null], bullet: [null, null]};
        this.skins = skins;
        var self = this;
        [["tank", data.ts1, data.ts2], ["bullet", data.bs1, data.bs2]].forEach(function (s) {
            [s[1], s[2]].forEach(function (url, k) {
                if (!url) return;
                var img = new Image();
                img.onload = function () {
                    skins[s[0]][k] = img;
                    self.board.styles = self.record[0].tanks.map(function (t, j) {
                        return self.rules.tankStyle(self.record, j, skins);
                    });
                    self.render();
                };
                img.src = url;
            });
        });

        this.rules.setupHud(this);
        this.board = new Board(el("canvas")[0], this.record, this.rounds, this.rules, skins);
        var c = this.board.colors;
        this.tape = new Tape(el("tape-canvas")[0], this.record, this.rounds, this.rules, {
            a: c.a, b: c.b, ink: c.ink, grid: c.muted, danger: c.danger, gold: c.gold, outline: c.tread,
            aSoft: cssVar("--rp-a-soft"), bSoft: cssVar("--rp-b-soft"), wash: cssVar("--rp-wash")
        });

        el("end-reason").text(this.rules.endReason(this.record,
            String($root.data("exit")), this.names));
        el("total").text(pad3(this.n));
        el("scrubber").attr("max", this.n);
        this.buildLog();
        this.buildStreams();
        this.bind();
        this.resize();
        if (this.n === 0) {
            $root.find("[data-action], [data-role='scrubber']").prop("disabled", true);
            this.showStatus("The match ended before the first round was played.");
        }
        this.render();
    }

    // Scroll a container (itself the offsetParent) so first..last are visible,
    // without moving the page.
    function scrollIntoBox(box, first, last) {
        if (!first) return;
        var top = first.offsetTop, bottom = last.offsetTop + last.offsetHeight;
        if (top < box.scrollTop || bottom > box.scrollTop + box.clientHeight) {
            box.scrollTop = Math.max(0, (top + bottom) / 2 - box.clientHeight / 2);
        }
    }

    Player.prototype.showStatus = function (text) {
        el("status").text(text).prop("hidden", !text);
    };

    Player.prototype.resize = function () {
        this.board.resize();
        this.tape.resize();
        this.render();
    };

    // Current snapshot index and progress into it.
    Player.prototype.position = function () {
        var i = Math.ceil(this.t - 1e-9);
        if (i <= 0) return {i: 0, p: 1};
        return {i: i, p: clamp(this.t - (i - 1), 0, 1)};
    };

    Player.prototype.render = function () {
        var pos = this.position();
        this.board.draw(pos.i, pos.p);
        this.tape.draw(this.t);
        if (pos.i !== this.lastRound) {
            this.lastRound = pos.i;
            this.updateRound(pos.i);
        }
        this.updateOverlay(pos.i === this.n && pos.p >= 1 && this.n > 0);
        if (!this.playing && !this.tween) this.idle();
    };

    // While paused, items breathe and jammed tanks flicker: redraw the board
    // (only) at a low rate for as long as there is something to animate.
    Player.prototype.idle = function () {
        if (this.idleRaf || reduceMotion) return;
        var self = this, last = 0;
        var frame = function (now) {
            self.idleRaf = 0;
            if (self.playing || self.tween) return; // the main loop draws
            var pos = self.position();
            if (!self.board.animated(pos.i)) return;
            if (now - last >= 40) { last = now; self.board.draw(pos.i, pos.p); }
            self.idleRaf = requestAnimationFrame(frame);
        };
        this.idleRaf = requestAnimationFrame(frame);
    };

    Player.prototype.updateRound = function (i) {
        var snap = this.record[i], info = this.rounds[i];
        el("round").text(pad3(i));
        el("scrubber").val(i).attr("aria-valuetext", "Round " + i + " of " + this.n);

        this.rules.updateHud(this, snap, info);

        var size = Math.max(0, Math.min(MAP, zoneOf(snap).size));
        var every = this.board.zoneEvery;
        var next = (Math.floor(i / every) + 1) * every - i;
        el("zone").text(size > 0 ?
            "zone " + size + "×" + size + (size > 2 ? " · closes in " + next : "") :
            "no safe zone");

        el("canvas").attr("aria-label", "Round " + i + ". " + this.rules.describe(snap, this.names));

        // Event log: highlight this round, dim the future, keep it in view.
        var $scroll = el("log-scroll"), $items = el("log").children();
        $items.each(function () {
            var r = +this.getAttribute("data-round");
            this.classList.toggle("is-future", r > i);
            this.classList.toggle("is-current", r === i);
        });
        var $cur = $items.filter(".is-current");
        if (!$cur.length) $cur = $items.not(".is-future").last();
        scrollIntoBox($scroll[0], $cur[0], $cur.last()[0]);

        // Highlight the stdout lines that produced this round's moves.
        var $stdio = $stdioCard;
        var open = $stdio.prop("open");
        $stdio.find("[data-stream^='stdout']").each(function () {
            var $lines = $(this).children(".replay-line").removeClass("is-current");
            var line = $lines.filter("[data-round='" + i + "']").addClass("is-current")[0];
            if (open) scrollIntoBox(this, line, line);
        });
    };

    Player.prototype.updateOverlay = function (show) {
        var $o = el("overlay");
        if (show === !$o.prop("hidden")) return;
        $o.prop("hidden", !show);
        if (!show) return;
        var w = +$root.data("winner");
        // Keep the banner on the half of the board away from the tanks.
        var tanks = this.record[this.n].tanks;
        var y = tanks.reduce(function (s, t) { return s + t.position[1]; }, 0) / tanks.length;
        $o.toggleClass("replay-board__overlay--top", y >= MAP / 2);
        el("overlay-title").text(w === -1 ? "DRAW" : this.names[w] + " wins")
            .attr("class", "replay-board__overlay-title replay-board__overlay-title--" + (w === -1 ? "draw" : TEAM[w]));
        el("overlay-text").text(el("end-reason").text());
    };

    Player.prototype.buildLog = function () {
        var $log = el("log").empty();
        var add = function (round, type, parts) {
            var $li = $("<li class='replay-log__item'>").addClass("replay-log__item--" + type)
                .attr("data-round", round);
            var $btn = $("<button type='button' class='replay-log__btn'>")
                .attr("aria-label", "Go to round " + round);
            $btn.append($("<span class='replay-log__round'>").text("R" + pad3(round)));
            var $text = $("<span class='replay-log__text'>");
            parts.forEach(function (p) { $text.append(typeof p === "string" ? document.createTextNode(p) : p); });
            $btn.append($text);
            $li.append($btn);
            $log.append($li);
        };
        this.rules.feed(this, add);
        add(this.n, "end", [el("end-reason").text() || "End of match"]);
    };

    Player.prototype.buildStreams = function () {
        var d = this.data, rules = this.rules;
        var $stdio = $stdioCard;
        [["stdout-A", d.A.stdout], ["stdout-B", d.B.stdout]].forEach(function (s) {
            var $pre = $stdio.find("[data-stream='" + s[0] + "']").empty();
            var text = String(s[1] || "");
            if (!text.trim()) { $pre.addClass("is-empty").text("(empty)"); return; }
            text.replace(/\n$/, "").split("\n").forEach(function (line, k) {
                $pre.append($("<span class='replay-line'>").attr("data-round", k + 1)
                    .attr("data-no", k + 1).text(rules.formatMoves(line)));
            });
        });
        [["stderr-A", d.A.stderr], ["stderr-B", d.B.stderr]].forEach(function (s) {
            var text = String(s[1] || "");
            var $pre = $stdio.find("[data-stream='" + s[0] + "']");
            if (text.trim()) $pre.text(text);
            else $pre.addClass("is-empty").text("(empty)");
        });
    };

    Player.prototype.bind = function () {
        var self = this;
        $root.on("click", "[data-action]", function () {
            switch (this.getAttribute("data-action")) {
                case "play": self.toggle(); break;
                case "prev": self.stepBy(-1); break;
                case "next": self.stepBy(1); break;
                case "start": self.seek(0); break;
                case "end": self.seek(self.n); break;
            }
        });
        el("scrubber").on("input", function () { self.seek(+this.value); });
        $stdioCard.on("toggle", function () {
            if (this.open) { self.lastRound = -1; self.render(); }
        });
        $root.on("click", ".replay-speed__opt", function () { self.setSpeed(+this.getAttribute("data-speed")); });
        el("log").on("click", ".replay-log__btn", function () {
            self.seek(+$(this).parent().attr("data-round"));
        });

        $(document).on("keydown", function (e) {
            var tag = e.target.tagName;
            if (e.altKey || e.ctrlKey || e.metaKey) return;
            if (tag === "TEXTAREA" || tag === "SELECT" || tag === "SUMMARY") return;
            // The scrubber handles its own arrow / Home / End keys.
            if (tag === "INPUT" && (e.target.type !== "range" || e.key !== " ")) return;
            if (self.n === 0) return;
            var big = e.shiftKey ? 10 : 1;
            switch (e.key) {
                case " ": case "k": case "K": self.toggle(); break;
                case "ArrowRight": case "l": case "L": self.stepBy(big); break;
                case "ArrowLeft": case "j": case "J": self.stepBy(-big); break;
                case "Home": self.seek(0); break;
                case "End": self.seek(self.n); break;
                case "]": self.setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(self.speed) + 1)]); break;
                case "[": self.setSpeed(SPEEDS[Math.max(0, SPEEDS.indexOf(self.speed) - 1)]); break;
                default: return;
            }
            e.preventDefault();
        });

        var pending = false;
        var onResize = function () {
            if (pending) return;
            pending = true;
            requestAnimationFrame(function () { pending = false; self.resize(); });
        };
        if (window.ResizeObserver) new ResizeObserver(onResize).observe(el("board")[0]);
        else $(window).on("resize", onResize);
        // The pixel font may arrive after the first paint.
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { self.render(); });
    };

    Player.prototype.setSpeed = function (speed) {
        this.speed = speed;
        $root.find(".replay-speed__opt").each(function () {
            this.setAttribute("aria-pressed", String(+this.getAttribute("data-speed") === speed));
        });
    };

    Player.prototype.setPlaying = function (on) {
        this.playing = on;
        var $btn = $root.find("[data-action='play']");
        $btn.toggleClass("is-playing", on).attr("aria-label", on ? "Pause" : "Play");
        if (on) this.loop();
    };

    Player.prototype.toggle = function () {
        if (this.playing) return this.setPlaying(false);
        if (this.t >= this.n) this.t = 0; // replay from the start
        this.tween = null;
        this.setPlaying(true);
    };

    Player.prototype.seek = function (round) {
        this.tween = null;
        this.setPlaying(false);
        this.t = clamp(Math.round(round), 0, this.n);
        this.render();
    };

    // Forward steps animate the round; backward steps jump.
    Player.prototype.stepBy = function (d) {
        this.setPlaying(false);
        var base = this.tween ? this.tween.to : Math.round(this.t);
        var target = clamp(base + d, 0, this.n);
        if (d === 1 && !reduceMotion && target > base) {
            this.t = base;
            this.tween = {to: target};
            this.loop();
        } else {
            this.tween = null;
            this.t = target;
            this.render();
        }
    };

    Player.prototype.loop = function () {
        if (this.raf) return;
        var self = this;
        this.lastFrame = performance.now();
        var frame = function (now) {
            var dt = Math.min(0.25, (now - self.lastFrame) / 1000);
            self.lastFrame = now;
            self.raf = 0;
            if (self.playing) {
                if (reduceMotion) {
                    // No interpolation: advance whole rounds at the chosen rate.
                    self.acc = (self.acc || 0) + dt * BASE_RPS * self.speed;
                    if (self.acc >= 1) { self.acc = 0; self.t = Math.min(self.n, Math.floor(self.t) + 1); }
                } else {
                    self.t = Math.min(self.n, self.t + dt * BASE_RPS * self.speed);
                }
                if (self.t >= self.n) self.setPlaying(false);
            } else if (self.tween) {
                self.t = Math.min(self.tween.to, self.t + dt * BASE_RPS * Math.max(1, self.speed) * 1.4);
                if (self.t >= self.tween.to) self.tween = null;
            } else {
                return;
            }
            self.render();
            if (self.playing || self.tween) self.raf = requestAnimationFrame(frame);
        };
        this.raf = requestAnimationFrame(frame);
    };

    /* ------------------------------------------------------------------ *
     * Boot
     * ------------------------------------------------------------------ */

    var id = window.location.pathname.replace(/\/+$/, "").split("/").pop();
    $.ajax({url: "/match/get/" + encodeURIComponent(id), dataType: "text"})
        .done(function (text) {
            var data;
            try { data = JSON.parse(text); } catch (e) { data = null; }
            if (!data || !data.record || !data.record.length) {
                el("status").text("This match has no recorded replay.");
                $root.find("[data-action], [data-role='scrubber']").prop("disabled", true);
                return;
            }
            data.A = data.A || {stdout: "", stderr: ""};
            data.B = data.B || {stdout: "", stderr: ""};
            el("status").prop("hidden", true);
            new Player(data);
        })
        .fail(function () {
            el("status").text("The replay could not be loaded. Refresh the page to try again.");
            $root.find("[data-action], [data-role='scrubber']").prop("disabled", true);
        });
});
