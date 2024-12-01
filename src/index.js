import React from "./lib/react-slim";

function App() {
  const [count, setCount] = React.useState(0);

  const handleClick = () => {
    setCount(count + 1);
  };

  return <div>
    <h1 onClick={handleClick}>Hello, {count}</h1>
    <h2>{ count % 2 === 0 ? 'Even' : 'Odd' }</h2>
    <ul>
      <li>1</li>
      <li>2</li>
      { count % 2 === 0 ? <li>3</li> : null }
    </ul>
  </div>;
}

React.render(<App count={1} />, document.getElementById("root"));
