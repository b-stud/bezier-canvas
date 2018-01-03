import ConstructionPoint from './ConstructionPoint';

/**
 * Point representation class
 */
export default class Point {
    static count = 0;
    public id = 0;
    public active: boolean = false;
    public parent: ConstructionPoint = null;
    public x;
    public y;

    constructor(x: number, y: number) {
        this.xCoord = x;
        this.yCoord = y;
        this.id = Point.count++;
    }

    set xCoord(x) {
        this.x = Math.round(x);
    }

    set yCoord(y) {
        this.y = Math.round(y);
    }

    isActive() {
        return this.active;
    }

    isHandler() {
        return this.isHandler1() || this.isHandler2();
    }

    isHandler1() {
        return this.parent.handler1 == this;
    }

    isHandler2() {
        return this.parent.handler2 == this;
    }

    clone() {
        return new Point(this.x, this.y);
    }

    toString(){
        return `(x: ${this.x}, y: ${this.y})`;
    }
}