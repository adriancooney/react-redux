const { Component, createElement } = require('react')
const storeShape = require('../utils/storeShape')
const shallowEqual = require('../utils/shallowEqual')
const isPlainObject = require('../utils/isPlainObject')
const componentLevelState = require('../utils/componentLevelState')
const wrapActionCreators = require('../utils/wrapActionCreators')
const hoistStatics = require('hoist-non-react-statics')
const invariant = require('invariant')
const defaultMapStateToProps = state => ({}) // eslint-disable-line no-unused-vars
const defaultMapDispatchToProps = dispatch => ({ dispatch })
const defaultMergeProps = (stateProps, dispatchProps, parentProps) => ({
  ...parentProps,
  ...stateProps,
  ...dispatchProps
})


const componentLevelStatePropName = "state"

function getDisplayName(WrappedComponent) {
  return WrappedComponent.displayName || WrappedComponent.name || 'Component'
}

// Helps track hot reloading.
let nextVersion = 0

function connect(mapStateToProps, mapDispatchToProps, mergeProps, componentReducer, options = {}) {
  const shouldSubscribe = Boolean(mapStateToProps)
  const finalMapStateToProps = mapStateToProps || defaultMapStateToProps
  const finalMapDispatchToProps = isPlainObject(mapDispatchToProps) ?
    wrapActionCreators(mapDispatchToProps) :
    mapDispatchToProps || defaultMapDispatchToProps
  const finalMergeProps = mergeProps || defaultMergeProps
  const doStatePropsDependOnOwnProps = finalMapStateToProps.length !== 1
  const doDispatchPropsDependOnOwnProps = finalMapDispatchToProps.length !== 1
  const { pure = true, withRef = false } = options

  // Helps track hot reloading.
  const version = nextVersion++

  function computeStateProps(store, props, componentId) {
    const state = store.getState()
    const stateProps = doStatePropsDependOnOwnProps ?
      finalMapStateToProps(state, props) :
      finalMapStateToProps(state)

    invariant(
      isPlainObject(stateProps),
      '`mapStateToProps` must return an object. Instead received %s.',
      stateProps
    )

    if(componentReducer) {
      console.log("State Props", stateProps)
      invariant(
        !!!stateProps[componentLevelStatePropName],
        `\`${componentLevelStatePropName}\' is an illegal identifier in \`mapStateToProps\` when using component level state.`
      );

      // Grab the components state and insert it in as a 
      // prop under the `componentLevelStatePropName` name.
      stateProps[componentLevelStatePropName] = componentLevelState.selectComponentState(state, componentId)
    }

    return stateProps
  }

  function computeDispatchProps(store, props) {
    const { dispatch } = store
    const dispatchProps = doDispatchPropsDependOnOwnProps ?
      finalMapDispatchToProps(dispatch, props) :
      finalMapDispatchToProps(dispatch)

    invariant(
      isPlainObject(dispatchProps),
      '`mapDispatchToProps` must return an object. Instead received %s.',
      dispatchProps
    )
    return dispatchProps
  }

  function computeMergedProps(stateProps, dispatchProps, parentProps) {
    const mergedProps = finalMergeProps(stateProps, dispatchProps, parentProps)
    invariant(
      isPlainObject(mergedProps),
      '`mergeProps` must return an object. Instead received %s.',
      mergedProps
    )
    return mergedProps
  }

  // Weak component Id generation. 
  // WARNING: NON DETERMINISTIC. The ID for a component should be determined
  // by the state so time travel and etc work appropriately.
  let __componentIds = 0;

  return function wrapWithConnect(WrappedComponent) {
    class Connect extends Component {
      shouldComponentUpdate() {
        return !pure || this.haveOwnPropsChanged || this.hasStoreStateChanged
      }

      constructor(props, context) {
        super(props, context)
        this.version = version
        this.store = props.store || context.store

        invariant(this.store,
          `Could not find "store" in either the context or ` +
          `props of "${this.constructor.displayName}". ` +
          `Either wrap the root component in a <Provider>, ` +
          `or explicitly pass "store" as a prop to "${this.constructor.displayName}".`
        )

        if(componentReducer) {
          // Mount the reducer for this component
          componentLevelState.mountReducer(this.getId(), componentReducer)

          // Compute the component state
          this.store.dispatch({ type: 'UPDATE_COMPONENT_STATE' });
        }

        const storeState = this.store.getState()
        this.state = { storeState }
        this.clearCache()
      }

      updateStatePropsIfNeeded() {
        const nextStateProps = computeStateProps(this.store, this.props, this.getId())
        if (this.stateProps && shallowEqual(nextStateProps, this.stateProps)) {
          return false
        }

        this.stateProps = nextStateProps
        return true
      }

      // Return the component id
      getId() {
        return this.__id || (this.__id = `component-${getDisplayName(WrappedComponent)}-${__componentIds++}`);
      }

      updateDispatchPropsIfNeeded() {
        const nextDispatchProps = computeDispatchProps(this.store, this.props)
        if (this.dispatchProps && shallowEqual(nextDispatchProps, this.dispatchProps)) {
          return false
        }

        this.dispatchProps = nextDispatchProps
        return true
      }

      updateMergedProps() {
        this.mergedProps = computeMergedProps(
          this.stateProps,
          this.dispatchProps,
          this.props
        )
      }

      isSubscribed() {
        return typeof this.unsubscribe === 'function'
      }

      trySubscribe() {
        if (shouldSubscribe && !this.unsubscribe) {
          this.unsubscribe = this.store.subscribe(::this.handleChange)
          this.handleChange()

          // Mount the component level reducer
          if(componentReducer) componentLevelState.mountReducer(this.getId(), componentReducer)
        }
      }

      tryUnsubscribe() {
        if (this.unsubscribe) {
          this.unsubscribe()
          this.unsubscribe = null

          if(componentReducer) componentLevelState.unmountReducer(this.getId())
        }
      }

      componentDidMount() {
        this.trySubscribe()
      }

      componentWillReceiveProps(nextProps) {
        if (!pure || !shallowEqual(nextProps, this.props)) {
          this.haveOwnPropsChanged = true
        }
      }

      componentWillUnmount() {
        this.tryUnsubscribe()
        this.clearCache()
      }

      clearCache() {
        this.dispatchProps = null
        this.stateProps = null
        this.mergedProps = null
        this.haveOwnPropsChanged = true
        this.hasStoreStateChanged = true
        this.renderedElement = null
      }

      handleChange() {
        if (!this.unsubscribe) {
          return
        }

        const prevStoreState = this.state.storeState
        const storeState = this.store.getState()

        if (!pure || prevStoreState !== storeState) {
          this.hasStoreStateChanged = true
          this.setState({ storeState })
        }
      }

      getWrappedInstance() {
        invariant(withRef,
          `To access the wrapped instance, you need to specify ` +
          `{ withRef: true } as the fourth argument of the connect() call.`
        )

        return this.refs.wrappedInstance
      }

      render() {
        const {
          haveOwnPropsChanged,
          hasStoreStateChanged,
          renderedElement
        } = this

        this.haveOwnPropsChanged = false
        this.hasStoreStateChanged = false

        let shouldUpdateStateProps = true
        let shouldUpdateDispatchProps = true
        if (pure && renderedElement) {
          shouldUpdateStateProps = hasStoreStateChanged || (
            haveOwnPropsChanged && doStatePropsDependOnOwnProps
          )
          shouldUpdateDispatchProps =
            haveOwnPropsChanged && doDispatchPropsDependOnOwnProps
        }

        let haveStatePropsChanged = false
        let haveDispatchPropsChanged = false
        if (shouldUpdateStateProps) {
          haveStatePropsChanged = this.updateStatePropsIfNeeded()
        }
        if (shouldUpdateDispatchProps) {
          haveDispatchPropsChanged = this.updateDispatchPropsIfNeeded()
        }

        let haveMergedPropsChanged = true
        if (
          haveStatePropsChanged ||
          haveDispatchPropsChanged ||
          haveOwnPropsChanged
        ) {
          this.updateMergedProps()
        } else {
          haveMergedPropsChanged = false
        }

        if (!haveMergedPropsChanged && renderedElement) {
          return renderedElement
        }

        if (withRef) {
          this.renderedElement = createElement(WrappedComponent, {
            ...this.mergedProps,
            ref: 'wrappedInstance'
          })
        } else {
          this.renderedElement = createElement(WrappedComponent,
            this.mergedProps
          )
        }

        return this.renderedElement
      }
    }

    Connect.displayName = `Connect(${getDisplayName(WrappedComponent)})`
    Connect.WrappedComponent = WrappedComponent
    Connect.contextTypes = {
      store: storeShape
    }
    Connect.propTypes = {
      store: storeShape
    }

    if (process.env.NODE_ENV !== 'production') {
      Connect.prototype.componentWillUpdate = function componentWillUpdate() {
        if (this.version === version) {
          return
        }

        // We are hot reloading!
        this.version = version
        this.trySubscribe()
        this.clearCache()
      }
    }

    return hoistStatics(Connect, WrappedComponent)
  }
}

module.exports = connect
