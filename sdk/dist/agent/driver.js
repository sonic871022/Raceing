export class AgentDriverRegistry {
    drivers = new Map();
    constructor(drivers = []) {
        for (const driver of drivers)
            this.register(driver);
    }
    register(driver, options = {}) {
        if (!driver.id.trim())
            throw new TypeError('agent driver id must not be empty');
        if (this.drivers.has(driver.id) && !options.replace) {
            throw new Error(`agent driver is already registered: ${driver.id}`);
        }
        this.drivers.set(driver.id, driver);
        return this;
    }
    unregister(id) {
        return this.drivers.delete(id);
    }
    get(id) {
        return this.drivers.get(id);
    }
    require(id) {
        const driver = this.get(id);
        if (!driver)
            throw new Error(`unknown agent driver: ${id}`);
        return driver;
    }
    list() {
        return [...this.drivers.values()];
    }
}
function actionKey(action) {
    return JSON.stringify({
        id: action.id,
        ...(action.x !== undefined ? { x: action.x } : {}),
        ...(action.y !== undefined ? { y: action.y } : {}),
        ...(action.index !== undefined ? { index: action.index } : {}),
        ...(action.boardId !== undefined ? { boardId: action.boardId } : {}),
        ...(action.zoneId !== undefined ? { zoneId: action.zoneId } : {}),
        ...(action.seat !== undefined ? { seat: action.seat } : {}),
        ...(action.targets !== undefined ? { targets: action.targets } : {}),
    });
}
export function isLegalAgentDecision(decision, legalActions) {
    const key = actionKey(decision.action);
    return legalActions.some((action) => actionKey(action) === key);
}
