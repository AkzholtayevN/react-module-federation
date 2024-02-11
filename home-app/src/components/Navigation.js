import React from "react";
import { Link } from "react-router-dom";

export const Navigation = () => {
  return (
    <nav>
      <ul>
        <li>
          <Link to="/">Home</Link>
        </li>
        <li>
          <Link to="/contacts">Contacts</Link>
        </li>
        <li>
          <Link to="/nca-layer">NCALayer</Link>
        </li>
      </ul>
    </nav>
  );
};
