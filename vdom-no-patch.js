const vdom = (function(){
  const isArray = (arr) => (toString.call(arr) === "[object Array]");
  const realObject = { 1:1, 2:2, 3:3};
  const isObject = (obj) => (typeof obj === 'object' && obj !== null);
  const isVHook = (hook) => (hook &&
    (typeof hook.hook === "function" && !hook.hasOwnProperty("hook") ||
    typeof hook.unhook === "function" && !hook.hasOwnProperty("unhook")));

  //- New getPrototype
  const getPrototype = value =>
    Object.getPrototypeOf
    ? Object.getPrototypeOf(value)
    : value.__proto__
      ? value.__proto__
      : value.constructor
        ? value.constructor.prototype
        : value;

  /**
   * Virtual Text Node
   */
  const VText = function(text) {
    this.text = String(text);
  }

  VText.prototype.type = "VirtualText";

  /**
   * Virtual Node
   */
  const VNode = function(tagName, properties, children, key, namespace) {
    this.tagName = tagName
    this.properties = properties || {}
    this.children = children || []
    this.key = key != null ? String(key) : undefined
    this.namespace = (typeof namespace === "string") ? namespace : null

    let 
      count = (children && children.length) || 0,
      descendants = 0,
      hasWidgets = false,
      hasThunks = false,
      descendantHooks = false,
      hooks;

    for(var propName in properties) {
      if (properties.hasOwnProperty(propName)) {
        let property = properties[propName];

        if(isVHook(property) && property.unhook) {
          if(!hooks) {
            hooks = {}
          }
          hooks[propName] = property
        }
      }
    }

    for(let i = 0; i < count; i++) {
      let child = children[i];

      if(isVNode(child)) {
        descendants += child.count || 0

        if(!hasWidgets && child.hasWidgets) {
          hasWidgets = true
        }

        if(!hasThunks && child.hasThunks) {
          hasThunks = true
        }

        if(!descendantHooks && (child.hooks || child.descendantHooks)) {
          descendantHooks = true
        }
      } 
      else if(!hasWidgets && isWidget(child)) {
        if(typeof child.destroy === "function") {
          hasWidgets = true
        }
      } 
      else if(!hasThunks && isVThunk(child)) {
        hasThunks = true;
      }
    }

    this.count = count + descendants;
    this.hasWidgets = hasWidgets;
    this.hasThunks = hasThunks;
    this.hooks = hooks;
    this.descendantHooks = descendantHooks;
  };

  VNode.prototype.type = "VirtualNode";

  /**
   * Apply properties
   */
  const patchObject = function(node, props, previous, propName, propValue) {
    let previousValue = previous ? previous[propName] : undefined;

    // Set attributes
    if(propName === "attributes") {
      for(let attrName in propValue) {
        let attrValue = propValue[attrName]

        if(attrValue === undefined) {
          node.removeAttribute(attrName)
        } 
        else {
          node.setAttribute(attrName, attrValue)
        }
      }

      return
    }

    if(previousValue && isObject(previousValue) && getPrototype(previousValue) !== getPrototype(propValue)) {
      node[propName] = propValue
      return
    }

    if(!isObject(node[propName])) {
      node[propName] = {}
    }

    let replacer = propName === "style" ? "" : undefined

    for(let k in propValue) {
      let value = propValue[k]
      node[propName][k] = (value === undefined) ? replacer : value
    }
  }

  /**
   *** Arguments
   * node - html node element.
   * props - properties we want to add to html node element.
   * previous -
   */
  const applyProperties = function(node, props, previous) {
    for(let propName in props) {
      let propValue = props[propName];

      if(propValue === undefined) {
        removeProperty(node, propName, propValue, previous);
      } 
      else if(isVHook(propValue)) {
        removeProperty(node, propName, propValue, previous)
        if(propValue.hook) {
          propValue.hook(node,
          propName,
          previous ? previous[propName] : undefined)
        }
      } 
      else {
        if(isObject(propValue)) {
          patchObject(node, props, previous, propName, propValue);
        } 
        else {
          node[propName] = propValue;
        }
      }
    }
  }

  const removeProperty = function(node, propName, propValue, previous) {
    if(previous) {
      let previousValue = previous[propName];

      if(!isVHook(previousValue)) {
        if(propName === "attributes") {
          for(let attrName in previousValue) {
            node.removeAttribute(attrName);
          }
        } 
        else if(propName === "style") {
          for(let i in previousValue) {
            node.style[i] = "";
          }
        } 
        else if(typeof previousValue === "string") {
          node[propName] = "";
        } 
        else {
          node[propName] = null;
        }
      } 
      else if(previousValue.unhook) {
        previousValue.unhook(node, propName, propValue);
      }
    }
  }


  /**
   * CreateElement
   */
  const isVNode = (n) => (n && n.type === "VirtualNode");
  const isVText = (t) => (t && t.type === "VirtualText");
  const isWidget = (w) => (w && w.type === "Widget");
  const isVThunk = (t) => (t && t.type === "Thunk");

  const handleThunk = function(a, b) {
    let 
      renderedA = a, 
      renderedB = b;

    if(isVThunk(b)) {
      renderedB = renderThunk(b, a)
    }

    if(isVThunk(a)) {
      renderedA = renderThunk(a, null)
    }

    return {
      a: renderedA,
      b: renderedB
    }
  }

  const createElement = function(vnode, opts) {
    let 
      doc = opts ? opts.document || document : document,
      warn = opts ? opts.warn : null;

    vnode = handleThunk(vnode).a;

    if(isWidget(vnode)) {
      return vnode.init();
    } 
    else if(isVText(vnode)) {
      return doc.createTextNode(vnode.text);
    } 
    else if(!isVNode(vnode)) {
      warn 
        ? warn("Item is not a valid virtual dom node", vnode)
        : null;
    }

    // Create node element
    // createElement - method creates the HTML element specified by tagName.
    // createElementNS - Creates an element with the specified namespace URI and qualified name.
    let node = (vnode.namespace === null) 
      ? doc.createElement(vnode.tagName) 
      : doc.createElementNS(vnode.namespace, vnode.tagName);

    // Adding properties to node element.
    let props = vnode.properties;
    applyProperties(node, props);

    // Adding children node to node elment.
    let children = vnode.children;
    for(var i = 0; i < children.length; i++) {
      let childNode = createElement(children[i], opts);
      if(childNode) {
        node.appendChild(childNode);
      }
    }

    return node;
  }
  
  return {
  	VNode,
    VText,
    createElement
  }
}());
