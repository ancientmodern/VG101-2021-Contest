define("algorithm", [], function() {
    function less(a, b) {
        return a < b;
    }

    function more(a, b) {
        return a> b;
    }

    function Pair(a, b) {
        this.first = a;
        this.second = b;
    }

    function TreeNode(elt) {
        this.root = elt;
        this.left = null;
        this.right = null;
    }

    TreeNode.prototype.insert = function(elt, compare = less) {
        if(compare(elt, this.root)) {
            if(!this.left) this.left = new TreeNode(elt);
            else this.left.insert(elt, less);
        } else {
            if(!this.right) this.right = new TreeNode(elt);
            else this.right.insert(elt, less);
        }
    };

    TreeNode.prototype.min = function() {
        if(!this.left) return this.root;
        else return this.left.min();
    };

    function SortTree() {
        this.tree = null;
    }

    SortTree.prototype.insert = function(elt, compare = less) {
        if(!this.tree) this.tree = new TreeNode(elt);
        else this.tree.insert(elt, compare);
    };

    SortTree.prototype.popMin = function() {
        if(!this.tree) return;
        if(!this.tree.left) {
            var ret =  this.tree.root;
            this.tree = this.tree.right;
            return ret;
        }

    };

    function PriorityQueue() {
        this.queue = [];
    }

    PriorityQueue.prototype.enqueue = function(elt, compare = more) {
        for(var i = 0; i < this.queue.length; i++) {
            if(compare(elt, this.queue[i])) {
                this.queue.splice(i, 0, elt);
                return;
            }
        }
        this.queue.push(elt);
    };

    PriorityQueue.prototype.dequeue = function() {
      var ret = this.queue[0];
      this.queue.shift();
      return ret;
    };

    return {
      PriorityQueue: PriorityQueue
    }
});