const vdom = (function(){
  const isArray = (arr) => (toString.call(arr) === "[object Array]");
  const nativeIsArray = Array.isArray;
  const toString = Object.prototype.toString;
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
  
  //* Diff Part *//
  const VPatch = function(type, vNode, patch) {
  this.type = Number(type)
  this.vNode = vNode
  this.patch = patch
  }

  VPatch.prototype.type = "VirtualPatch";

  VPatch.NONE = 0;
  VPatch.VTEXT = 1;
  VPatch.VNODE = 2;
  VPatch.WIDGET = 3;
  VPatch.PROPS = 4;
  VPatch.ORDER = 5;
  VPatch.INSERT = 6;
  VPatch.REMOVE = 7;
  VPatch.THUNK = 8;

  const hasPatches = function(patch) {
    for(var index in patch) {
      if(index !== "a") {
        return true;
      }
    }
    return false;
  }

  const undefinedKeys = function(obj) {
    let result = {}; 
    for(let key in obj) {
      result[key] = undefined;
    }
    return result;
  }

  // Create a sub-patch for thunks
  const thunks = function(a, b, patch, index) {
    let 
      nodes = handleThunk(a, b),
      thunkPatch = diff(nodes.a, nodes.b);

    if(hasPatches(thunkPatch)) {
      patch[index] = new VPatch(VPatch.THUNK, null, thunkPatch)
    }
  }

  // Execute hooks when two nodes are identical
  const unhook = function(vNode, patch, index) {
    if(isVNode(vNode)) {
      if(vNode.hooks) {
        patch[index] = appendPatch(
          patch[index],
          new VPatch(
            VPatch.PROPS,
            vNode,
            undefinedKeys(vNode.hooks)
          )
        )
      }

      if(vNode.descendantHooks || vNode.hasThunks) {
        let 
          children = vNode.children,
          len = children.length;

        for (var i = 0; i < len; i++) {
          let child = children[i];
          index += 1;
          unhook(child, patch, index);
          if(isVNode(child) && child.count) {
            index += child.count;
          }
        }
      }
    } 
    else if(isVThunk(vNode)) {
      thunks(vNode, null, patch, index)
    }
  }

  // Patch records for all destroyed widgets must be added because we need
  // a DOM node reference for the destroy function
  const destroyWidgets = function(vNode, patch, index) {
    if(isWidget(vNode)) {
      if(typeof vNode.destroy === "function") {
        patch[index] = appendPatch(
          patch[index],
          new VPatch(VPatch.REMOVE, vNode, null)
        );
      }
    } 
    else if(isVNode(vNode) && (vNode.hasWidgets || vNode.hasThunks)) {
      let 
        children = vNode.children,
        len = children.length;

      for (var i = 0; i < len; i++) {
        let child = children[i];
        index += 1;
        destroyWidgets(child, patch, index);

        if(isVNode(child) && child.count) {
          index += child.count;
        }
      }
    } 
    else if(isVThunk(vNode)) {
      thunks(vNode, null, patch, index)
    }
  }


  const clearState = function(vNode, patch, index) {
    // TODO: Make this a single walk, not two
    unhook(vNode, patch, index)
    destroyWidgets(vNode, patch, index)
  }


  const renderThunk = function(thunk, previous) {
    let renderedThunk = thunk.vnode;

    if(!renderedThunk) {
      renderedThunk = thunk.vnode = thunk.render(previous)
    }

    if(!(isVNode(renderedThunk) || isVText(renderedThunk) || isWidget(renderedThunk))) {
      throw new Error("thunk did not return a valid node");
    }

    return renderedThunk
  }

  const diffProps = function(a, b) {
    let diff;

    for(var aKey in a) {
      if(!(aKey in b)) {
        diff = diff || {};
        diff[aKey] = undefined;
      }

      let
        aValue = a[aKey],
        bValue = b[aKey];

      if(aValue === bValue) {
        continue;
      } 
      else if(isObject(aValue) && isObject(bValue)) {
        if(getPrototype(bValue) !== getPrototype(aValue)) {
          diff = diff || {};
          diff[aKey] = bValue;
        } 
        else if(isHook(bValue)) {
          diff = diff || {};
          diff[aKey] = bValue;
        } 
        else {
          let objectDiff = diffProps(aValue, bValue);
          if(objectDiff) {
            diff = diff || {};
            diff[aKey] = objectDiff;
          }
        }
      } 
      else {
        diff = diff || {};
        diff[aKey] = bValue;
      }
    }

    for (let bKey in b) {
      if (!(bKey in a)) {
        diff = diff || {};
        diff[bKey] = b[bKey];
      }
    }
    return diff;
  }

  const diffChildren = function(a, b, patch, apply, index) {
    let 
      aChildren = a.children,
      orderedSet = reorder(aChildren, b.children),
      bChildren = orderedSet.children,
      aLen = aChildren.length,
      bLen = bChildren.length,
      len = aLen > bLen ? aLen : bLen

    for(var i = 0; i < len; i++) {
      let 
        leftNode = aChildren[i],
        rightNode = bChildren[i];

      index += 1;

      if(!leftNode) {
        if(rightNode) {
          // Excess nodes in b need to be added
          apply = appendPatch(apply,
            new VPatch(VPatch.INSERT, null, rightNode)
          );
        }
      } 
      else {
        walk(leftNode, rightNode, patch, index);
      }

      if (isVNode(leftNode) && leftNode.count) {
        index += leftNode.count;
      }
    }

    if (orderedSet.moves) {
      // Reorder nodes last
      apply = appendPatch(apply, new VPatch(
        VPatch.ORDER,
        a,
        orderedSet.moves)
      );
    }
    return apply
  }

  const keyIndex = function(children) {
    let 
      keys = {},
      free = [],
      length = children.length;

    for(var i = 0; i < length; i++) {
      let child = children[i];

      if(child.key) {
        keys[child.key] = i;
      } 
      else {
        free.push(i);
      }
    }

    return {
      keys: keys,     // A hash of key name to index
      free: free      // An array of unkeyed item indices
    }
  }

  const remove = function(arr, index, key) {
    arr.splice(index, 1);
    return {
      from: index,
      key: key
    }
  }

  // List diff, naive left to right reordering
  const reorder = function(aChildren, bChildren) {
    // O(M) time, O(M) memory
    let 
      bChildIndex = keyIndex(bChildren),
      bKeys = bChildIndex.keys,
      bFree = bChildIndex.free;

    if(bFree.length === bChildren.length) {
      return {
        children: bChildren,
        moves: null
      }
    }

    // O(N) time, O(N) memory
    let 
      aChildIndex = keyIndex(aChildren),
      aKeys = aChildIndex.keys,
      aFree = aChildIndex.free;

    if(aFree.length === aChildren.length) {
      return {
        children: bChildren,
        moves: null
      }
    }

    // O(MAX(N, M)) memory
    let newChildren = [];

    let 
      freeIndex = 0,
      freeCount = bFree.length,
      deletedItems = 0;

    // Iterate through a and match a node in b
    // O(N) time,
    for(var i = 0 ; i < aChildren.length; i++) {
      let 
        aItem = aChildren[i],
        itemIndex;

      if(aItem.key) {
        if (bKeys.hasOwnProperty(aItem.key)) {
          // Match up the old keys
          itemIndex = bKeys[aItem.key];
          newChildren.push(bChildren[itemIndex]);
        } 
        else {
          // Remove old keyed items
          itemIndex = i - deletedItems++
          newChildren.push(null)
        }
      } 
      else {
        // Match the item in a with the next free item in b
        if (freeIndex < freeCount) {
          itemIndex = bFree[freeIndex++]
          newChildren.push(bChildren[itemIndex])
        } 
        else {
          // There are no free items in b to match with
          // the free items in a, so the extra free nodes
          // are deleted.
          itemIndex = i - deletedItems++
          newChildren.push(null)
        }
      }
    }

    let lastFreeIndex = freeIndex >= bFree.length 
      ? bChildren.length 
      : bFree[freeIndex];

    // Iterate through b and append any new keys
    // O(M) time
    for(var j = 0; j < bChildren.length; j++) {
      let newItem = bChildren[j];
      if(newItem.key) {
        if(!aKeys.hasOwnProperty(newItem.key)) {
          // Add any new keyed items
          // We are adding new items to the end and then sorting them
          // in place. In future we should insert new items in place.
          newChildren.push(newItem);
        }
      } 
      else if(j >= lastFreeIndex) {
        // Add any leftover non-keyed items
        newChildren.push(newItem);
      }
    }

    let
      simulate = newChildren.slice(),
      simulateIndex = 0,
      removes = [],
      inserts = [],
      simulateItem;

    for(var k = 0; k < bChildren.length;) {
      let wantedItem = bChildren[k];
      simulateItem = simulate[simulateIndex];

      // remove items
      while(simulateItem === null && simulate.length) {
        removes.push(remove(simulate, simulateIndex, null));
        simulateItem = simulate[simulateIndex];
      }

      if(!simulateItem || simulateItem.key !== wantedItem.key) {
        // if we need a key in this position...
        if(wantedItem.key) {
          if(simulateItem && simulateItem.key) {
            // if an insert doesn't put this key in place, it needs to move
            if(bKeys[simulateItem.key] !== k + 1) {
              removes.push(remove(simulate, simulateIndex, simulateItem.key));
              simulateItem = simulate[simulateIndex];
              // if the remove didn't put the wanted item in place, we need to insert it
              if (!simulateItem || simulateItem.key !== wantedItem.key) {
                inserts.push({key: wantedItem.key, to: k});
              }
              // items are matching, so skip ahead
              else {
                simulateIndex++;
              }
            }
            else {
              inserts.push({key: wantedItem.key, to: k});
            }
          }
          else {
            inserts.push({key: wantedItem.key, to: k});
          }
          k++
        }
        // a key in simulate has no matching wanted key, remove it
        else if(simulateItem && simulateItem.key) {
          removes.push(remove(simulate, simulateIndex, simulateItem.key));
        }
      }
      else {
        simulateIndex++;
        k++;
      }
    }

    // remove all the remaining nodes from simulate
    while(simulateIndex < simulate.length) {
      simulateItem = simulate[simulateIndex];
      removes.push(remove(simulate, simulateIndex, simulateItem && simulateItem.key));
    }

    // If the only moves we have are deletes then we can just
    // let the delete patch remove these items.
    if(removes.length === deletedItems && !inserts.length) {
      return {
        children: newChildren,
        moves: null
      }
    }

    return {
      children: newChildren,
      moves: {
        removes: removes,
        inserts: inserts
      }
    }
  }

  const appendPatch = function(apply, patch) {
    if (apply) {
      if (isArray(apply)) {
        apply.push(patch)
      } 
      else {
        apply = [apply, patch]
      }
      return apply
    } 
    else {
      return patch
    }
  }

  function walk(a, b, patch, index) {
    if (a === b) {
      return
    }

    var apply = patch[index]
    var applyClear = false

    if (isVThunk(a) || isVThunk(b)) {
      thunks(a, b, patch, index)
    } 
    else if (b == null) {
      // If a is a widget we will add a remove patch for it
      // Otherwise any child widgets/hooks must be destroyed.
      // This prevents adding two remove patches for a widget.
      if (!isWidget(a)) {
        clearState(a, patch, index)
        apply = patch[index]
      }

      apply = appendPatch(apply, new VPatch(VPatch.REMOVE, a, b))
    } 
    else if (isVNode(b)) {
      if (isVNode(a)) {
        if (a.tagName === b.tagName &&
          a.namespace === b.namespace &&
          a.key === b.key) {

          var propsPatch = diffProps(a.properties, b.properties)
          if (propsPatch) {
            apply = appendPatch(apply,
            new VPatch(VPatch.PROPS, a, propsPatch))
          }

          apply = diffChildren(a, b, patch, apply, index)
        } 
        else {
          apply = appendPatch(apply, new VPatch(VPatch.VNODE, a, b))
          applyClear = true
        }
      } 
      else {
        apply = appendPatch(apply, new VPatch(VPatch.VNODE, a, b))
        applyClear = true
      }
    } 
    else if (isVText(b)) {
      if (!isVText(a)) {
        apply = appendPatch(apply, new VPatch(VPatch.VTEXT, a, b))
        applyClear = true
      } 
      else if (a.text !== b.text) {
        apply = appendPatch(apply, new VPatch(VPatch.VTEXT, a, b))
      }
    } 
    else if (isWidget(b)) {
      if (!isWidget(a)) {
        applyClear = true
      }

      apply = appendPatch(apply, new VPatch(VPatch.WIDGET, a, b))
    }

    if (apply) {
      patch[index] = apply
    }

    if (applyClear) {
      clearState(a, patch, index)
    }
  }

  const diff = function(a, b) {
    let patch = { a: a };
    walk(a, b, patch, 0);
    return patch
  }
  
  return {
    VNode,
    VText,
    createElement,
    isArray, 
    nativeIsArray, 
    toString,
    realObject,
    isVHook,
    isObject,
    isVNode, 
    isVText, 
    isWidget, 
    isVThunk,
    diff
  }
}());
