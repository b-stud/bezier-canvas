import Point from './Point';

/**
 * This class is used to place shapes along the whole spline to an equal distance
 *
 * (Note): Some parts of this file has been largely inspired by the following links :
 *
 * - https://gamedev.stackexchange.com/questions/5373/
 * /moving-ships-between-two-planets-along-a-bezier-missing-some-equations-for-acce/5427#5427
 * - http://www.carlosicaza.com/2012/08/12
 * /an-more-efficient-way-of-calculating-the-length-of-a-bezier-curve-part-ii/
 */
export default class BezierUtils {

    // Bezier control points of the spline (a,b) and (c,d)
    a: Point;
    b: Point;
    c: Point;
    d: Point;
    length: number; // spline length
    len: number; // precision steps
    arcLengths: Array<number>; // Spline divisions

    /**
     * Cubic bezier basic interpolation algorithm for curve C (P0, P1, P2, P3) at position t
     * @param {number} t
     * @param {Point} P0
     * @param {Point} P1
     * @param {Point} P2
     * @param {Point} P3
     * @returns {Point}
     */
    static cubicBezierInterpolate = (t: number, P0: Point, P1: Point, P2: Point, P3: Point): Point => {
        const x = P0.x * Math.pow(1 - t, 3) + 3 * P1.x * t * Math.pow((1 - t), 2)
            + 3 * P2.x * t * t * (1 - t) + +P3.x * t * t * t;
        const y = P0.y * Math.pow(1 - t, 3) + 3 * P1.y * t * Math.pow((1 - t), 2)
            + 3 * P2.y * t * t * (1 - t) + +P3.y * t * t * t;
        return new Point(x, y);
    }

    /**
     * Cubic bezier basic interpolation algorithm shortcut
     * @param {number} t
     * @returns {Point}
     */
    interpolate = (t: number): Point => {
        return BezierUtils.cubicBezierInterpolate(t, this.a, this.b, this.c, this.d);
    }

    constructor(a: Point, b: Point, c: Point, d: Point, len: number = 200) {
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;

        this.len = len;
        this.arcLengths = new Array(this.len + 1);
        this.arcLengths[0] = 0;

        const interpolationPoint = this.interpolate(0);
        let ox = interpolationPoint.x, oy = interpolationPoint.y;
        let clen = 0;
        for (let i = 1; i <= this.len; i += 1) {
            const interpolation = this.interpolate(i / len);
            const x = interpolation.x;
            const y = interpolation.y;
            const dx = ox - x, dy = oy - y;
            clen += Math.sqrt(dx * dx + dy * dy);
            this.arcLengths[i] = clen;
            ox = x;
            oy = y;
        }
    }

    /**
     * Point re-mapper, try to remap a coordinate by ignoring spline dynamism,
     * ie: 0.5 should refer to the middle of the spline
     * @param {number} u bezier coordinate
     * @returns {number} mapped
     */
    map(u: number) {
        const targetLength = u * this.arcLengths[this.len];
        let low = 0, high = this.len, index = 0;
        while (low < high) {
            index = low + (((high - low) / 2) | 0);
            if (this.arcLengths[index] < targetLength) {
                low = index + 1;

            } else {
                high = index;
            }
        }
        if (this.arcLengths[index] > targetLength) {
            index--;
        }

        const lengthBefore = this.arcLengths[index];
        if (lengthBefore === targetLength) {
            return index / this.len;

        } else {
            return (index + (targetLength - lengthBefore) / (this.arcLengths[index + 1] - lengthBefore)) / this.len;
        }
    }

    /**
     * Maps a bezier point to a cartesian one (x)
     * @param {number} u bezier point (0 to 1)
     * @returns {number} point.x
     */
    mx(u: number) {
        return this.interpolate(this.map(u)).x;
    }

    /**
     * Maps a bezier point to a cartesian one (y)
     * @param {number} u bezier point (0 to 1)
     * @returns {number} point.y
     */
    my(u: number) {
        return this.interpolate(this.map(u)).y;
    }


    /**
     * Gets the spline length
     * source: http://www.carlosicaza.com/2012/08/12
     * /an-more-efficient-way-of-calculating-the-length-of-a-bezier-curve-part-ii/
     */
    getLength() {
        const steps = 100;
        const inc = 100;
        let length = 0;
        let t = 0;
        const pt = {x: NaN, y: NaN};
        const prevPt = {x: NaN, y: NaN};
        const c: Array<Point> = [this.a, this.b, this.c, this.d];
        for (let i = 0; i < inc; i += 1) {
            t = i / steps;
            const t1: number = 1.0 - t;
            const t1_3: number = t1 * t1 * t1;
            const t1_3a: number = (3 * t) * (t1 * t1);
            const t1_3b: number = (3 * (t * t)) * t1;
            const t1_3c: number = (t * t * t );
            pt.x = (c[0].x * t1_3) + (t1_3a * c[1].x) + (t1_3b * c[2].x) + (t1_3c * c[3].x);
            pt.y = (c[0].y * t1_3) + (t1_3a * c[1].y) + (t1_3b * c[2].y) + (t1_3c * c[3].y);
            if (i > 0) {
                const x = pt.x - prevPt.x;
                const y = pt.y - prevPt.y;
                length = length + Math.sqrt(x * x + y * y);
            }
            prevPt.x = pt.x;
            prevPt.y = pt.y;
        }
        return length;
    }
}
