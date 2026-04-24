import React from 'react';
import './styles/main.css';

export default function Sidebar() {
  return (
    <div className="sidebar">
      <h3>Controls</h3>
      <div className="control-group">
        <label>Image Modality</label>
        <select>
          <option>CT</option>
          <option>MR</option>
          <option>US</option>
          <option>XR</option>
        </select>
      </div>
      <div className="control-group">
        <label>Upload Image</label>
        <input type="file" />
      </div>
      <div className="control-group">
        <label>Noise Level</label>
        <input type="range" min="0" max="100" />
      </div>
      <div className="control-group">
        <label>Downscaling</label>
        <input type="checkbox" />
      </div>
      <div className="control-group">
        <label>Model Type</label>
        <select>
          <option>Model 1</option>
          <option>Model 2</option>
        </select>
      </div>
    </div>
  );
}
