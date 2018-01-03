import {Keys} from './Keys';

export default abstract class HistoryManagerAbstract {

    private statesCursor = 0;
    private statesStack = [];
    protected lastHistoryStateHash = null;

    private safeStatesCursor(cursor: number) {
        this.statesCursor = Math.max(0, Math.min(this.statesStack.length - 1, cursor));
        return this.statesCursor;
    }

    private removeFirstState() {
        this.statesStack.shift();
    }

    private statesBackward() {
        if (this.statesStack.length) {
            this.applyHistoryState(this.statesStack[this.safeStatesCursor(this.statesCursor - 1)]);
        }
    }

    private statesForward() {
        if (this.statesStack.length) {
            this.applyHistoryState(this.statesStack[this.safeStatesCursor(this.statesCursor + 1)]);
        }
    }

    protected historyManagerHandleKeyboardEvents(e: KeyboardEvent) {
        const code = e.which || e.keyCode;
        if (code === Keys.Z && e.ctrlKey) {
            this.statesBackward();
        }
        if (code === Keys.Y && e.ctrlKey) {
            this.statesForward();
        }
    }

    protected pushHistoryState(state: any = null) {
        this.statesStack = this.statesStack.slice(0, this.statesCursor + 1);
        if (this.statesStack.length === this.historySize) {
            this.removeFirstState();
        }
        this.statesStack.push(state || this.getCurrentState());
        this.statesCursor = this.statesStack.length - 1;
    }

    protected pushHistoryStateIfChanged() {
        if (this.getCurrentStateHash() !== this.lastHistoryStateHash) {
            this.lastHistoryStateHash = this.getCurrentStateHash();
            this.pushHistoryState(this.getCurrentState());
        }
    }

    public historyReset() {
        this.statesCursor = 0;
        this.statesStack = [];
        this.lastHistoryStateHash = null;
    }

    protected abstract getCurrentState();

    protected abstract getCurrentStateHash();

    protected abstract applyHistoryState(historyState: any);

    constructor(protected historySize = 50) {
    }
}