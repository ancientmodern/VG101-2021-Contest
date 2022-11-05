/*
 * A simple realization of an 2D vector
 */

function Vector(x = 0, y = 0) {
    this.x = x;
    this.y = y;
}

Vector.prototype.add = function(another) {
    return new Vector(this.x+another.x, this.y+another.y);
};

Vector.prototype.copy = function() {
    return new Vector(this.x, this.y);
}

Vector.prototype.equal = function(another) {
    return (this.x === another.x) && (this.y === another.y);
}

Vector.prototype.toString = function() {
    return "Vector(" + this.x + ", " + this.y + ")";
}

module.exports = Vector;
