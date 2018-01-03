/**
 * Available types of line caps for spline rendering
 */
export default class LineCap {

    public static Butt = "butt";
    public static Round = "round";
    public static Square = "square";

    public static parse(val: string): string {
        return (val === LineCap.Butt || val === LineCap.Round || val === LineCap.Square) ? val : LineCap.Round;
    }
};