import './polyfills';
import Point from './Point';
import ConstructionPoint from './ConstructionPoint';
import {Shapes} from './Shapes';
import LineCap from './LineCap';
import BezierUtils from './BezierUtils';
import HistoryManagerAbstract from './HistoryManagerAbstract';

export default class BezierCanvas extends HistoryManagerAbstract {

    private paintSplineOn = true;
    private constructionPoints = [];
    private mouseMoveThrottleTime = 30;
    private lastMouseMoveTime = NaN;
    private canvas: HTMLCanvasElement = null;
    private ctx: any = null;
    private isMouseDown = false;
    private ctrlKeyIsDown = false;
    private currentMovingPoint: Point = null;
    private mouseReleaseAfterConstructionPointCreation = true;
    private options = {
        historySize: 50,
        naturalDrawMode: true,
        maxDistance: 10,
        smoothFactor: 0.5,
        constraintTangents: true,

        constructionPointSize: 6,
        constructionPointBorderSize: 1,
        constructionPointBorderColor: 'rgb(150, 150, 150)',
        constructionPointFillColor: 'rgb(230, 230, 230)',
        constructionPointActiveFillColor: 'cyan',
        constructionPointActiveBorderColor: 'rgb(100, 120, 255)',
        constructionPointShape: Shapes.Disc,

        controlPointBorderColor: 'rgb(120, 120, 120)',
        controlPointFillColor: 'rgb(180, 180, 180)',
        controlPointActiveFillColor: 'cyan',
        controlPointActiveBorderColor: 'rgb(100, 120, 255)',
        controlPointBorderSize: 10,
        controlPointSize: 4,
        controlPointShape: Shapes.Disc,

        tangentColor: 'rgb(150, 150, 150)',
        tangentThickness: 2,

        lineCap: LineCap.Round,
        splineColor: 'rgb(0,0,200)',
        splineThickness: 5,
        showMaxNextAndPreviousTangents: 1 // Set -1 for all
    };

    /**
     * Get distance between 2 points
     * @param {Point} a First point
     * @param {Point} b Second point
     * @returns {number} Distance
     */
    private static getDistance(a: Point, b: Point): number {
        return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
    }

    /**
     * Move along the segment defined by 2 points, depending on the weight
     * @param {Point} P0 First point
     * @param {Point} P1 Second point
     * @param {number} t Weight
     * @returns {Point}
     */
    private static weighted = (P0: Point, P1: Point, t: number): Point => {
        return new Point(P0.x * (1 - t) + P1.x * t, P0.y * (1 - t) + P1.y * t);
    }

    /**
     * Reset the current active point
     */
    private resetActivePoint(): void {
        this.constructionPoints.forEach((point) => {
            point.active = false;
            point.handler1.active = false;
            if (point.handler2) {
                point.handler2.active = false;
            }
        });
    }

    /**
     * Set a point to active
     * @param {Point} point
     */
    private setActivePoint(point: Point): void {
        this.resetActivePoint();
        point.active = true;
        this.currentMovingPoint = point;
    }

    /**
     * Implementation of the De Casteljau's reverse algorithm to remove a construction point between 2 others
     * @param {ConstructionPoint} point
     */
    private removeConstructionPoint(point: ConstructionPoint): void {
        let foundIndex = NaN, foundPoint = null, P0 = null, P1 = null, P2 = null, P3 = null;
        if (this.currentMovingPoint === point) {
            this.currentMovingPoint = null;
        }
        this.constructionPoints.forEach((curPoint, index) => {
            if (curPoint.id === point.id) {
                foundIndex = index;
                foundPoint = curPoint;
                P0 = this.constructionPoints[index - 1] || null;
                P1 = (P0 ? (P0.handler2 || P0.handler1) : null);
                P3 = this.constructionPoints[index + 1] || null;
                P2 = (P3 ? P3.handler1 : null);
                return;
            }
        });
        if (point.fromCasteljau && P0 && P1 && P2 && P3) {
            const k = BezierCanvas.getDistance(foundPoint.handler2, foundPoint)
                / BezierCanvas.getDistance(foundPoint.handler1, foundPoint);
            if (!isNaN(k)) {
                const Px = (1 + k) * P1.x - k * P0.x;
                const Py = (1 + k) * P1.y - k * P0.y;
                const P = new Point(Px, Py);
                const Qx = ((1 + k) * P2.x - P3.x) / k;
                const Qy = ((1 + k) * P2.y - P3.y) / k;
                const Q = new Point(Qx, Qy);
                P1.x = P.x;
                P1.y = P.y;
                P2.x = Q.x;
                P2.y = Q.y;
            }
        }

        this.constructionPoints.splice(foundIndex, 1);
        if (this.constructionPoints.length && !this.options.naturalDrawMode) {
            // First & last points only have one handler (in normal mode)
            if (this.constructionPoints[0].handler2) {
                this.constructionPoints[0].handler1 = this.constructionPoints[0].handler2.clone();
                this.constructionPoints[0].handler2 = null;
            }
            this.constructionPoints[this.constructionPoints.length - 1].handler2 = null;
        }
    }

    /**
     * Get the closest construction point from position (x, y) or null if no one is closer or equal to maxDistance
     * @param {number} x X coordinate
     * @param {number} y Y coordinate
     * @returns {ConstructionPoint} Closest construction point
     */
    private findClosestConstructionPoint(x: number, y: number): ConstructionPoint | null {
        let foundPoint = null;
        const position = new Point(x, y);
        this.constructionPoints.forEach((curPoint) => {
            const distance = BezierCanvas.getDistance(position, curPoint);
            if (distance < this.options.maxDistance) {
                foundPoint = curPoint;
                return;
            }
        });
        return foundPoint;
    }

    /**
     * Projects a position (x,y) to a point on the current drawn Spline
     * @param {number} x X coordinate
     * @param {number} y Y coordinate
     * @returns {any} The projection point if it's found regarding maxDistance option, null else
     */
    private findPointOnSpline(x: number, y: number): any {
        let foundPoint = null, distance = NaN, position = NaN, t = NaN, P0 = null, P1 = null, P2 = null, P3 = null;
        const clickPosition = new Point(x, y);
        const steps = 100; // Precision steps
        this.constructionPoints.forEach((currentPoint, index) => {
            const nextPoint = this.constructionPoints[index + 1];
            if (null == nextPoint) {
                return;
            } else {
                for (let i = 0; i <= steps; i++) {
                    const curPoint = BezierUtils.cubicBezierInterpolate(
                        i / steps,
                        currentPoint,
                        currentPoint.handler2 || currentPoint.handler1,
                        nextPoint.handler1,
                        nextPoint
                    );
                    const curDistance = BezierCanvas.getDistance(curPoint, clickPosition);
                    if (curDistance <= this.options.maxDistance && (isNaN(distance) || distance > curDistance)) {
                        foundPoint = new Point(curPoint.x, curPoint.y);
                        distance = curDistance;
                        position = index;
                        t = i / steps;
                        P0 = currentPoint;
                        P1 = (currentPoint.handler2 || currentPoint.handler1);
                        P2 = nextPoint.handler1;
                        P3 = nextPoint;
                    }
                }
            }
        });
        return foundPoint ? {
            point: foundPoint, distance: distance,
            position: position + 1, t: t, P0: P0, P1: P1, P2: P2, P3: P3
        } : null;
    }


    /**
     * Implementation of the De Casteljau's algorithm to insert a new construction point between 2 existing ones
     * @param t
     * @param P0
     * @param P1
     * @param P2
     * @param P3
     */
    private knotInsertion(t, P0, P1, P2, P3): void {
        const P4 = BezierCanvas.weighted(P0, P1, t);
        const P5 = BezierCanvas.weighted(P1, P2, t);
        const P6 = BezierCanvas.weighted(P2, P3, t);
        const P7 = BezierCanvas.weighted(P4, P5, t);
        const P8 = BezierCanvas.weighted(P5, P6, t);
        const P9 = BezierCanvas.weighted(P7, P8, t);
        const newPoint = new ConstructionPoint(P9.x, P9.y);
        newPoint.fromCasteljau = true;
        this.setActivePoint(newPoint);
        newPoint.handler1 = P7;
        newPoint.handler2 = P8;
        P1.x = P4.x;
        P1.y = P4.y;
        P2.x = P6.x;
        P2.y = P6.y;
        this.constructionPoints.forEach((point, index) => {
            if (point.id === P0.id) {
                this.constructionPoints.splice(index + 1, 0, newPoint);
                return;
            }
        });
    }

    /**
     * Mouse up management
     */
    private bindCanvasMouseUp(): void {
        this.canvas.addEventListener('mouseup', () => {
            this.isMouseDown = false;
            this.mouseReleaseAfterConstructionPointCreation = true;
            this.pushHistoryStateIfChanged();
        });
    }

    /**
     * Right click management
     */
    private bindCanvasMouseDownRight(): void {
        this.canvas.addEventListener('contextmenu', (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            const position = this.getPosition(e);
            const point = this.findClosestConstructionPoint(position.x, position.y);
            if (null != point) {
                this.removeConstructionPoint(point);
            }
            return false;
        });
    }

    /**
     * Mouse Leave management
     */
    private bindCanvasMouseLeave(): void {
        this.canvas.addEventListener('mouseleave', (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            this.isMouseDown = false;
            this.mouseReleaseAfterConstructionPointCreation = true;
            this.pushHistoryStateIfChanged();
            return false;
        });
    }

    /**
     * Left click management
     */
    private bindCanvasMouseDownLeft(): void {
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.which !== 1) {
                return;
            }
            this.isMouseDown = true;
            const position = this.getPosition(e);
            let distance = NaN, selectedPoint = null;
            if (this.ctrlKeyIsDown) { // When Ctrl Key is down, check if mousedown on a point
                this.constructionPoints.forEach((constructionPoint) => {
                    const pointsToCheck = [constructionPoint, constructionPoint.handler1];
                    if (constructionPoint.handler2) {
                        pointsToCheck.push(constructionPoint.handler2);
                    }
                    pointsToCheck.forEach((checkedPoint) => {
                        const curDistance = BezierCanvas.getDistance(checkedPoint, position);
                        if (curDistance <= this.options.maxDistance
                            && (isNaN(distance) || (distance >= curDistance))) {
                            distance = BezierCanvas.getDistance(checkedPoint, position);
                            selectedPoint = checkedPoint;
                        }
                    });
                });
                if (!selectedPoint) {
                    return (this.currentMovingPoint = null);
                } else {
                    this.setActivePoint(selectedPoint);
                }
            } else { // Check if construction point to insert is on spline (between 2 other construction points)
                const pointOnSpline = this.findPointOnSpline(position.x, position.y);
                if (pointOnSpline) {
                    return this.knotInsertion(
                        pointOnSpline.t,
                        pointOnSpline.P0,
                        pointOnSpline.P1,
                        pointOnSpline.P2,
                        pointOnSpline.P3
                    );
                }
            }

            if (!selectedPoint) { // No selected point, then create a new construction point
                this.mouseReleaseAfterConstructionPointCreation = false;
                const point = new ConstructionPoint(position.x, position.y);
                point.handler1 = new Point(position.x, position.y); // We don't set the handler2, as it's the last point
                if (this.options.naturalDrawMode) {
                    point.handler2 = new Point(position.x, position.y);
                }

                this.constructionPoints.push(point);
                this.setActivePoint(this.options.naturalDrawMode ? point.handler2 : point.handler1);

                if (this.constructionPoints.length > 2) {
                    // Set the handler2 of the N-1 (previous) point (Level 1 smoothness (same derivative))
                    const D = this.constructionPoints[this.constructionPoints.length - 2]; // Prev construction point
                    if (this.options.naturalDrawMode) {
                        D.handler1 = new Point(
                            D.x - this.options.smoothFactor * (D.handler2.x - D.x),
                            D.y - this.options.smoothFactor * (D.handler2.y - D.y)
                        );

                    } else {
                        D.handler2 = new Point(
                            D.x - this.options.smoothFactor * (D.handler1.x - D.x),
                            D.y - this.options.smoothFactor * (D.handler1.y - D.y)
                        );
                    }
                }
            }

        });
    }

    /**
     * Key press management
     */
    private bindKeyPress(): void {
        document.addEventListener('keydown', (e: any) => {
            const code = e.which || e.keyCode;
            if (e.ctrlKey) {
                this.ctrlKeyIsDown = true;
            }
            this.historyManagerHandleKeyboardEvents(e);
        });
        document.addEventListener('keyup', () => {
            this.ctrlKeyIsDown = false;
        });
    }

    /**
     * Mouse move when mouse is pressed management
     */
    private bindCanvasMouseDownMove(): void {
        this.canvas.addEventListener('mousemove', (e) => {

            if (!this.isMouseDown) {
                return;
            } else {
                // Limit mouseMove events
                const time = new Date().getTime();
                if (!isNaN(this.lastMouseMoveTime) && time < this.lastMouseMoveTime + this.mouseMoveThrottleTime) {
                    return;
                } else {
                    this.lastMouseMoveTime = time;
                }
            }

            const position = this.getPosition(e);
            const activePoint = this.currentMovingPoint;

            if (!activePoint) {
                return false;
            }

            let delta1X = NaN, delta1Y = NaN;
            let delta2X = NaN, delta2Y = NaN;

            if (activePoint instanceof ConstructionPoint) {
                delta1X = activePoint.x - activePoint.handler1.x;
                delta1Y = activePoint.y - activePoint.handler1.y;
                if (activePoint.handler2) {
                    delta2X = activePoint.x - activePoint.handler2.x;
                    delta2Y = activePoint.y - activePoint.handler2.y;
                }
            }

            if (!(activePoint instanceof ConstructionPoint)) {
                if (this.options.constraintTangents) {
                    if (activePoint.isHandler1() && activePoint.parent.handler2) {
                        const distance1 = BezierCanvas.getDistance(position, activePoint.parent);
                        const distance2 = BezierCanvas.getDistance(activePoint.parent.handler2, activePoint.parent);
                        if (this.options.naturalDrawMode && !this.mouseReleaseAfterConstructionPointCreation) {
                            activePoint.parent.handler2.x = activePoint.parent.x - (position.x - activePoint.parent.x);
                            activePoint.parent.handler2.y = activePoint.parent.y - (position.y - activePoint.parent.y);
                        } else {
                            const ratio = (distance1 / distance2);
                            if (ratio !== 0) {
                                activePoint.parent.handler2.x = activePoint.parent.x
                                    + (1 / ratio) * (activePoint.parent.x - position.x);
                                activePoint.parent.handler2.y = activePoint.parent.y
                                    + (1 / ratio) * (activePoint.parent.y - position.y);
                            } else {
                                return;
                            }
                        }
                    } else if (activePoint.isHandler2()) {
                        const distance1 = BezierCanvas.getDistance(position, activePoint.parent);
                        const distance2 = BezierCanvas.getDistance(activePoint.parent.handler1, activePoint.parent);
                        const ratio = (distance1 / distance2);
                        if (this.options.naturalDrawMode && !this.mouseReleaseAfterConstructionPointCreation) {
                            activePoint.parent.handler1.x = activePoint.parent.x - (position.x - activePoint.parent.x);
                            activePoint.parent.handler1.y = activePoint.parent.y - (position.y - activePoint.parent.y);
                        } else {
                            if (ratio !== 0) {
                                activePoint.parent.handler1.x = activePoint.parent.x
                                    + (1 / ratio) * (activePoint.parent.x - position.x);
                                activePoint.parent.handler1.y = activePoint.parent.y
                                    + (1 / ratio) * (activePoint.parent.y - position.y);
                            } else {
                                return;
                            }
                        }
                    }
                }
            }

            activePoint.x = position.x;
            activePoint.y = position.y;

            if (activePoint instanceof ConstructionPoint) {
                activePoint.handler1.x = activePoint.x - delta1X;
                activePoint.handler1.y = activePoint.y - delta1Y;
                if (activePoint.handler2) {
                    activePoint.handler2.x = activePoint.x - delta2X;
                    activePoint.handler2.y = activePoint.y - delta2Y;
                }
            }
        });
    }

    /**
     * Get a position object from a mouse event
     * @param e
     * @returns {Point}
     */
    private getPosition = (e: any): Point => {
        const rect = this.canvas.getBoundingClientRect();
        return new Point(e.clientX - rect.left, e.clientY - rect.top);
    }

    /**
     * Renders a Construction Point
     * @param {ConstructionPoint} point
     */
    private paintConstructionPoint(point: ConstructionPoint): void {
        this.ctx.save();
        this.ctx.strokeStyle = this.options.constructionPointBorderColor;
        this.ctx.fillStyle = this.options.constructionPointFillColor;
        this.ctx.lineWidth = this.options.constructionPointBorderSize;
        if (point.isActive()) {
            this.ctx.fillStyle = this.options.constructionPointActiveFillColor;
            this.ctx.strokeStyle = this.options.constructionPointActiveBorderColor;
        }
        switch (this.options.constructionPointShape) {
            case Shapes.Disc:
                this.ctx.beginPath();
                this.ctx.arc(point.x, point.y, 0.5 * this.options.constructionPointSize, 0, 2 * Math.PI, false);
                if (this.options.constructionPointBorderSize > 0) {
                    this.ctx.lineWidth = this.options.constructionPointBorderSize;
                    this.ctx.stroke();
                }
                this.ctx.closePath();
                this.ctx.fill();
                break;
            case Shapes.Square:
            default:
                this.ctx.fillRect(
                    point.x - this.options.constructionPointSize / 2,
                    point.y - this.options.constructionPointSize / 2,
                    this.options.constructionPointSize,
                    this.options.constructionPointSize);
                if (this.options.constructionPointBorderSize > 0) {
                    this.ctx.lineWidth = this.options.constructionPointBorderSize;
                    this.ctx.beginPath();
                    this.ctx.stroke();
                    this.ctx.closePath();
                }
                break;
        }
        this.ctx.restore();
    }

    /**
     * Renders a Control Point
     * @param {Point} point
     */
    private paintControlPoint(point: Point): void {
        this.ctx.save();
        this.ctx.strokeStyle = this.options.controlPointBorderColor;
        this.ctx.fillStyle = this.options.controlPointFillColor;
        this.ctx.lineWidth = this.options.controlPointBorderSize;
        if (point.isActive()) {
            this.ctx.fillStyle = this.options.controlPointActiveFillColor;
            this.ctx.strokeStyle = this.options.controlPointActiveBorderColor;
        }
        switch (this.options.controlPointShape) {
            case Shapes.Disc:
                this.ctx.beginPath();
                this.ctx.arc(point.x, point.y, 0.5 * this.options.controlPointSize, 0, 2 * Math.PI, false);
                this.ctx.fill();
                this.ctx.closePath();
                break;
            case Shapes.Square:
                this.ctx.fillRect(
                    point.x - this.options.controlPointSize / 2,
                    point.y - this.options.controlPointSize / 2,
                    this.options.controlPointSize,
                    this.options.controlPointSize
                );
                break;
        }
        if (this.options.controlPointBorderSize > 0) {
            this.ctx.lineWidth = this.options.controlPointBorderSize;
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    /**
     * Renders tangent (segment between 2 Control points)
     * @param {Point} point1
     * @param {Point} point2
     */
    private paintTangent(point1: Point, point2: Point): void {
        if (!this.options.tangentThickness) {
            return;
        }
        this.ctx.save();
        this.ctx.strokeStyle = this.options.tangentColor;
        this.ctx.lineWidth = this.options.tangentThickness;
        this.ctx.beginPath();
        this.ctx.moveTo(point1.x, point1.y);
        this.ctx.lineTo(point2.x, point2.y);
        this.ctx.stroke();
        this.ctx.closePath();
        this.ctx.restore();
    }

    /**
     * Renders the Bezier spline
     */
    private paintBezier(): void {
        if (this.constructionPoints.length > 1) {
            this.ctx.save();
            this.ctx.strokeStyle = this.options.splineColor;
            this.ctx.lineWidth = this.options.splineThickness;

            this.ctx.lineCap = LineCap.parse(this.options.lineCap);

            this.ctx.beginPath();
            this.constructionPoints.forEach((point, index) => {
                if (this.constructionPoints.length > 1 && index !== this.constructionPoints.length - 1) {
                    const p0 = point, p3 = this.constructionPoints[index + 1];
                    const p1 = (p0.handler2 || p0.handler1);
                    const p2 = p3.handler1;
                    this.ctx.moveTo(p0.x, p0.y);
                    this.ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
                }
            });
            this.ctx.stroke();
            this.ctx.closePath();
            this.ctx.restore();
        }
    }

    /**
     * Renders the active point (separated method to make it on top of all other layers)
     * @param {Point} point
     */
    private renderActivePoint(point: Point): void {
        if (point instanceof ConstructionPoint) {
            this.paintConstructionPoint(point);
        } else {
            this.paintControlPoint(point);
        }
    }

    /**
     * Check if a point is linked to the active point (e.g. if it's one of its Control Points)
     * @param point
     * @returns {boolean}
     */
    private concernsActivePoint(point): boolean {
        if (!this.currentMovingPoint) {
            return false;
        }
        if (point instanceof ConstructionPoint) {
            if (this.currentMovingPoint === (point.handler1)
                || (point.handler2 && this.currentMovingPoint === point.handler2)) {
                return true;
            }
        } else if (point === this.currentMovingPoint.parent) {
            return true;
        }
        return false;
    }

    /**
     * Check if there are less than maxPositionBefore points between active point and pointToCheck
     * @param {ConstructionPoint} pointToCheck
     * @param {number} maxPositionBefore
     * @returns {boolean}
     */
    private isLessOrEqualThanPointsBefore(pointToCheck: ConstructionPoint, maxPositionBefore: number): boolean {
        if (!this.currentMovingPoint) {
            return false;
        } else {
            // Find active point & compared index
            let activeIndex = NaN, comparedIndex = NaN;
            this.constructionPoints.forEach((curPoint, i) => {
                if ((this.currentMovingPoint instanceof ConstructionPoint && curPoint === this.currentMovingPoint)
                    || ((!(this.currentMovingPoint instanceof ConstructionPoint))
                        && curPoint === this.currentMovingPoint.parent)
                ) {
                    activeIndex = i;
                    if (!isNaN(comparedIndex)) {
                        return;
                    }
                }
                if (curPoint === pointToCheck) {
                    comparedIndex = i;
                    if (!isNaN(activeIndex)) {
                        return;
                    }
                }
            });
            if (!isNaN(comparedIndex) && !isNaN(activeIndex)) {
                return Math.abs(comparedIndex - activeIndex) <= maxPositionBefore;
            }
            return false;
        }
    }

    /**
     * Main rendering method that calls all sub rendering methods
     */
    private paintSpline(): void {
        let activePoint = null;

        this.paintBezier();
        this.constructionPoints.forEach((point) => {

            let paintControlPoints = false;

            if (this.options.showMaxNextAndPreviousTangents === -1 || this.concernsActivePoint(point)
                || this.isLessOrEqualThanPointsBefore(point, this.options.showMaxNextAndPreviousTangents)) {
                paintControlPoints = true;
                this.paintTangent(point, point.handler1);
                if (point.handler2) {
                    this.paintTangent(point, point.handler2);
                }
            }

            if (point.isActive()) {
                activePoint = point;
            } else {
                this.paintConstructionPoint(point);
            }

            if (paintControlPoints) {
                if (point.handler1.isActive()) {
                    activePoint = point.handler1;
                } else {
                    this.paintControlPoint(point.handler1);
                }

                if (point.handler2) {
                    if (point.handler2.isActive()) {
                        activePoint = point.handler2;
                    } else {
                        this.paintControlPoint(point.handler2);
                    }
                }
            }

            if (activePoint) { // Render at last to make it over all layers
                this.renderActivePoint(activePoint);
            }
        });
    }

    /**
     * Initialize canvas and UI events management
     * @param canvas
     */
    private init(canvas): void {
        this.canvas = canvas;
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        this.bindCanvasMouseDownLeft();
        this.bindCanvasMouseUp();
        this.bindCanvasMouseDownMove();
        this.bindCanvasMouseDownRight();
        this.bindCanvasMouseLeave();
        this.bindKeyPress();
        this.paint();
    }

    /***** Implementation of History Manager Abstract ******/
    /**
     * Switch to historyState
     * @param historyState
     */
    protected applyHistoryState(historyState: any): void {
        this.setPoints(historyState);
    }

    /**
     * Gets current state
     * @returns {Array<any>}
     */
    protected getCurrentState(): Array<any> {
        return this.getPoints();
    }

    /**
     * Gets an Hash of the current state
     * @returns {string}
     */
    protected getCurrentStateHash(): string {
        return JSON.stringify(this.getCurrentState());
    }

    /*******************************************************/

    /**
     * Constructor
     * @param {HTMLCanvasElement} canvas
     * @param options Customization options
     */
    constructor(canvas: HTMLCanvasElement, options: any = {}) {
        super();
        this.setOptions(options);
        this.historySize = this.options.historySize;
        if (options.hasOwnProperty('points')) {
            this.setPoints(options.points);
        }
        this.init(canvas);
    }

    /***********************************************PUBLIC API**********************************************/
    /**
     * Change current opttions
     * @param options JSON object
     */
    public setOptions(options: any): void {
        Object.assign(this.options, options);
    }

    /**
     * Triggers a view refreshment
     * @param {Function} callback
     */
    public paint(callback: Function = () => {
    }): void {
        this.clear();
        if (this.paintSplineOn) {
            this.paintSpline();
        }
        callback(this.ctx);
    }

    /**
     * Starts a new blank project
     * @param {Function} callback
     */
    public reset(callback: Function = () => {
    }): void {
        this.clear();
        this.historyReset();
        this.constructionPoints = [];
    }

    /**
     * Get current points - used for state management (import/export/history))
     * @returns {Array<any>}
     */
    public getPoints(): Array<any> {
        const ret = [];
        this.constructionPoints.forEach((point: ConstructionPoint) => {
            const set = {
                x: point.x,
                y: point.y,
                hp1: {x: point.handler1.x, y: point.handler1.y}
            };
            if (point.handler2) {
                set['hp2'] = {x: point.handler2.x, y: point.handler2.y};
            }
            ret.push(set);
        });
        return ret;
    }

    /**
     * Set current points - used for state management
     * @returns {Array<any>}
     */
    public setPoints(points: Array<any>): void {
        this.reset();
        points.forEach((point) => {
            const parsed = new ConstructionPoint(point.x, point.y);
            parsed.handler1 = new Point(point.hp1.x, point.hp1.y);
            if (point.hasOwnProperty('hp2')) {
                parsed.handler2 = new Point(point.hp2.x, point.hp2.y);
            }
            this.constructionPoints.push(parsed);
        });
    }

    /**
     * Disable rendering
     */
    public hideSpline(): void {
        this.paintSplineOn = false;
    }

    /**
     * Enable rendering
     */
    public showSpline(): void {
        this.paintSplineOn = true;
    }

    /**
     * Clear canvas
     */
    public clear(): void {
        if (this.ctx) {
            this.ctx.clearRect(-1, -1, 1 + this.canvas.width, 1 + this.canvas.height);
        }
    }

    /**
     * Given a number of shapes to draw; get all positions where to place shapes to be separated by an equal distance
     * @param {number} shapesCount  Number of shapes to draw along the spline
     * @returns {any}  Return an array with all positions on which drawing the shapes
     */
    public getRegularlyPlacedPoints(shapesCount: number) {
        if (this.constructionPoints.length < 2) {
            return [];
        }
        const points: Array<Point> = [],
            beziers: Array<BezierUtils> = [];

        // Getting the total length
        let length = 0;
        this.constructionPoints.forEach((currentPoint, index) => {
            const nextPoint = this.constructionPoints[index + 1];
            if (null == nextPoint) {
                return;
            } else {
                const bz = new BezierUtils(
                    currentPoint,
                    currentPoint.handler2 || currentPoint.handler1,
                    nextPoint.handler1,
                    nextPoint
                );
                beziers.push(bz);
                length += bz.getLength();
            }
        });

        let drawnNumber = 0;
        let currentDistance = 0;
        beziers.forEach((bz, index) => {
            currentDistance += bz.getLength();
            let shapesToStick = Math.floor((currentDistance / length) * shapesCount) - drawnNumber;
            if (index === bz.length - 1) {
                shapesToStick = shapesCount - drawnNumber;
            }
            drawnNumber += shapesToStick;
            if (shapesToStick > 0) {
                for (let t = 0; t < shapesToStick; t += 1) {
                    let x = NaN, y = NaN;
                    if (index === beziers.length - 1) {
                        x = bz.mx(t / (shapesToStick - 1));
                        y = bz.my(t / (shapesToStick - 1));
                    } else {
                        x = bz.mx(t / (shapesToStick));
                        y = bz.my(t / (shapesToStick));
                    }
                    points.push(new Point(x, y));
                }
            }

        });
        return points;
    }
}
