import Point from './Point';

/**
 * Bezier construction point representation
 */
export default class ConstructionPoint extends Point {
    private _handler1: Point = null;
    private _handler2: Point = null;
    public fromCasteljau = false;

    /**
     * First control point getter
     * @returns {Point}
     */
    public get handler1() {
        return this._handler1;
    }

    /**
     * Last control point getter
     * @returns {Point}
     */
    public get handler2() {
        return this._handler2;
    }

    /**
     * First control point setter
     * @returns {Point}
     */
    public set handler1(point: Point) {
        this._handler1 = point;
        if (point) {
            this._handler1.parent = this;
        }
    }

    /**
     * Last control point setter
     * @returns {Point}
     */
    public set handler2(point: Point) {
        this._handler2 = point;
        if (point) {
            this._handler2.parent = this;
        }
    }
}