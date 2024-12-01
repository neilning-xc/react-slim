function createElement(type, props, ...children) {
  return { 
    type, 
    props: {
      ...props,
      children: children.map(child => 
        typeof child === "object" ? child : createTextElement(child)
      )
    }
  };
}

function createTextElement(text) {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: []
    }
  };
}

function createDom(fiber) {
  const dom = 
    fiber.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type);

  // 首次渲染时，也调用updateDom函数，用于设置属性和事件
  updateDom(dom, {}, fiber.props);

  return dom;
}

// 是否是事件属性
const isEvent = (key) => key.startsWith('on');
// 非children和事件属性
const isProperty = (key) => key !== 'children' && !isEvent(key);
// 判断是否是新属性
const isNew = (prev, next) => (key) => prev[key] !== next[key];
// 判断属性是否需要删除
const isGone = (prev, next) => (key) => !(key in next);
function updateDom(dom, prevProps, nextProps) {
  // 删除旧事件
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  // 删除旧属性
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = '';
    });

  // 设置新属性
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      dom[name] = nextProps[name];
    });

  // 添加新事件
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });
}

function commitRoot() {
  // 首先删除节点
  deletions.forEach(commitWork);
  commitWork(wipRoot.child);
  currentRoot = wipRoot;
  wipRoot = null;
}

function commitWork(fiber) {
  if (!fiber) {
    return;
  }

  // const domParent = fiber.parent.dom;
  let domParentFiber = fiber.parent;
  // 函数式组件的dom属性不存在时，需要向上查找父节点的dom属性，直到找到dom属性
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent;
  }
  const domParent = domParentFiber.dom;

  if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
    // 新增节点
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
    // 更新节点
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    // 删除节点
    // 新增commitDeletion函数，用于删除节点
    commitDeletion(fiber, domParent);
  }

  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

function commitDeletion(fiber, domParent) {
  // 如果元素存在dom属性，说明普通元素，直接删除
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else {
    // 如果是函数式组件，递归查找子节点的dom属性，直到找到dom属性，再删除
    commitDeletion(fiber.child, domParent);
  }
}

function render(element, container) {
  wipRoot = {
    dom: container,
    props: {
      children: [element]
    },
    alternate: currentRoot
  };
  deletions = [];
  nextUnitOfWork = wipRoot;
}

let currentRoot = null;
let nextUnitOfWork = null; // 下一个工作单元
let wipRoot = null; // work in progress root
let deletions = null;

function workLoop(deadline) {
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }

  if (!nextUnitOfWork && wipRoot) {
    commitRoot();
  }

  requestIdleCallback(workLoop);
}
requestIdleCallback(workLoop);

function performUnitOfWork(fiber) {
  const isFunctionComponent = fiber.type instanceof Function;
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }
  
  // 返回下一个工作单元
  // 如果当前节点存在子节点，则返回子节点
  if (fiber.child) {
    return fiber.child;
  }

  // 如果不存在子节点，则返回兄弟节点，
  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    // 如果不存在兄弟节点，则返回父节点的兄弟节点
    nextFiber = nextFiber.parent;
  }
  // 函数执行完毕，会回到根节点，整个fiber树构建完成
}

// 函数组件中处理hooks
let wipFiber = null;
// 当前组件中的hook索引
let hookIndex = null;
function updateFunctionComponent(fiber) {
  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = [];
  // 调用函数组件，将函数的返回值作为children
  const children = [fiber.type(fiber.props)];
  reconcileChildren(fiber, children);
}

function useState(initial) {
  // 获取旧的hook
  const oldHook = wipFiber.alternate && wipFiber.alternate.hooks && wipFiber.alternate.hooks[hookIndex];
  const hook = {
    state: oldHook ? oldHook.state : initial,
    queue: []
  };

  // 执行setState时，将action添加到queue中，计算新的state
  const actions = oldHook ? oldHook.queue : [];
  actions.forEach(action => {
    const isFunction = action instanceof Function;
    // 如果是函数，执行函数，否则直接赋值
    hook.state = isFunction ? action(hook.state) : action;
  });

  const setState = action => {
    hook.queue.push(action);
    // 触发workLoop中的更新流程
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot
    };
    nextUnitOfWork = wipRoot;
    deletions = [];
  };

  wipFiber.hooks.push(hook);
  hookIndex++;
  return [hook.state, setState];
}

// 普通元素，创建dom节点
function updateHostComponent(fiber) {
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }

  // 协调子节点
  reconcileChildren(fiber, fiber.props.children);
}

// 创建新的函数，用于协调子节点
function reconcileChildren(wipFiber, elements) {
  let index = 0;
  // 获取当前节点的alternate属性的child属性,他会跟elements数组进行比较
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevSibling = null;

  while (index < elements.length || oldFiber != null) {
    const element = elements[index];
    let newFiber = null;

    // 判断新旧节点的type是否相同
    const sameType = oldFiber && element && element.type === oldFiber.type;

    // 类型相同，更新节点属性
    if (sameType) {
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber.dom,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: "UPDATE" // 新增effectTag属性，用于标记节点的操作类型
      };
    }

    // 类型不同，直接增加新节点。首次渲染时，只有新增操作
    if (element && !sameType) {
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: "PLACEMENT"
      };
    }

    // element不存在，删除节点
    if (oldFiber && !sameType) {
      oldFiber.effectTag = "DELETION";
      deletions.push(oldFiber); // 新增deletions数组，用于存放删除节点
    }

    // 获取下一个旧节点，用于下次循环比较
    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }

    // 将第一个子fiber赋值给父fiber的child属性
    if (index === 0) {
      wipFiber.child = newFiber;
    } else if (element) {
      // 将后续子fiber赋值给前一个子fiber的sibling属性
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
    index++;
  }
}

const React = {
  createElement,
  render,
  useState,
};

export default React;