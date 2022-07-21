import * as UI from '../../legacy.js';
export declare class BezierUI {
    width: number;
    height: number;
    marginTop: number;
    radius: number;
    linearLine: boolean;
    constructor(width: number, height: number, marginTop: number, controlPointRadius: number, linearLine: boolean);
    static drawVelocityChart(bezier: UI.Geometry.CubicBezier, path: Element, width: number): void;
    curveWidth(): number;
    curveHeight(): number;
    private drawLine;
    private drawControlPoints;
    drawCurve(bezier: UI.Geometry.CubicBezier | null, svg: Element): void;
}
export declare const Height = 26;
