const invariant = require('invariant')

/**
 * This object holds all the currently mounted component level reducers.
 * @type {Object}
 */
const mountedReducers = {}

/**
 * The root name describes the name of the property all the component state's
 * live under in the root state object.
 * @type {String}
 */
const rootName = "components"

/**
 * Mount a reducer under a key.
 * @param  {String} key       The reference key.
 * @param  {Function} reducer State reducer.
 */
function mountReducer(key, reducer) {
    console.log("Mounting reducer for component key '%s'", key)
    mountedReducers[key] = reducer
}

/**
 * Unmount a mounted reducer.
 * @param {String} key The mounted reducer's key.
 */
function unmountReducer(key) {
    console.log("Unmounting reducer for component key '%s'", key)
    delete mountedReducers[key]
}

/**
 * Select a component's state from the global state.
 * @param  {Object} state The current state.
 * @param  {String} key   The component key.
 * @return {Any}          The component's state.
 */
function selectComponentState(state, key) {
    invariant(
        state[rootName],
        `Component level state reducer has not been added to root reducers under the proprty name '${rootName}'.`
    )

    return state[rootName][key]
}

/**
 * The reducer that combines the mounted component reducers.
 * @param  {Object} state  Current state.
 * @param  {Object} action The dispatched action.
 * @return {Object}        The combined output of all the mounted reducers.
 */
function componentReducer(state, action) {
    return Object.keys(mountedReducers).reduce((state, component) => {
        state[component] = mountedReducers[component](state[component], action)
        return state
    }, {});
}

module.exports = { mountReducer, unmountReducer, selectComponentState, componentReducer }