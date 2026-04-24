// BetaClarityPage.jsx
// © 2025 Betaclarity. All rights reserved.

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useContext,
  useMemo
} from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from "chart.js";

import { useNavigate } from "react-router-dom"; // Remove if not using react-router
import "./styles.css"; // Your custom CSS

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// IMPORTANT: point this to your Flask backend:
const PYTHON_API_URL = process.env.REACT_APP_API_URL || "";

// --------------------------------------------------------------------
// Processing Context
// --------------------------------------------------------------------
const ProcessingContext = React.createContext(null);

function ProcessingProvider({ children }) {
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [progressMessage, setProgressMessage] = useState("IDLE");

  const value = useMemo(() => ({
    progress,
    setProgress,
    processing,
    setProcessing,
    progressMessage,
    setProgressMessage
  }), [progress, processing, progressMessage]);

  return (
    <ProcessingContext.Provider value={value}>
      {children}
    </ProcessingContext.Provider>
  );
}

function useProcessing() {
  return useContext(ProcessingContext);
}

// --------------------------------------------------------------------
// Processing Bar
// --------------------------------------------------------------------
const ProcessingBar = React.memo(() => {
  const { progress, progressMessage } = useProcessing();

  const containerStyle = {
    display: "flex",
    flexDirection: "column",
    width: "400px",
    margin: "0 auto",
    alignItems: "center"
  };
  const barStyle = {
    width: "100%",
    height: "25px",
    backgroundColor: "#1a1a1a",
    borderRadius: "12px",
    overflow: "hidden",
    border: "1px solid #333"
  };
  const fillStyle = {
    height: "100%",
    backgroundColor: "#007bff",
    transition: "width 0.2s ease",
    borderRadius: "12px",
    width: `${progress}%`
  };
  const textStyle = {
    marginTop: "6px",
    color: "#fff",
    fontSize: "14px",
    fontWeight: "500"
  };

  return (
    <div style={containerStyle}>
      <div style={barStyle}>
        <div style={fillStyle} />
      </div>
      <div style={textStyle}>
        {progressMessage}... {Math.round(progress)}%
      </div>
    </div>
  );
});

// --------------------------------------------------------------------
// Hook: Draggable + Resizable
// --------------------------------------------------------------------
function useDraggableResizable(defaultPos, defaultSize) {
  const [position, setPosition] = useState(defaultPos);
  const [size, setSize] = useState(defaultSize);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeOffset, setResizeOffset] = useState({ w: 0, h: 0 });
  const windowRef = useRef(null);

  const onMouseDownBar = (e) => {
    setDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const onMouseDownResize = (e) => {
    e.stopPropagation();
    setResizing(true);
    setResizeOffset({
      w: e.clientX - (position.x + size.width),
      h: e.clientY - (position.y + size.height)
    });
  };

  const onMouseMove = useCallback(
    (e) => {
      if (dragging) {
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;
        setPosition({ x: newX, y: newY });
      } else if (resizing) {
        const newW = e.clientX - position.x - resizeOffset.w;
        const newH = e.clientY - position.y - resizeOffset.h;
        setSize({
          width: Math.max(newW, 200),
          height: Math.max(newH, 100)
        });
      }
    },
    [dragging, resizing, dragOffset, resizeOffset, position]
  );

  const onMouseUp = () => {
    setDragging(false);
    setResizing(false);
  };

  useEffect(() => {
    if (dragging || resizing) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    } else {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging, resizing, onMouseMove]);

  return {
    windowRef,
    position,
    setPosition,
    size,
    setSize,
    onMouseDownBar,
    onMouseDownResize,
    dragging,
    resizing
  };
}

// --------------------------------------------------------------------
// Componente Ruler per le misurazioni
// --------------------------------------------------------------------
const Ruler = React.memo(({ active, imageRef, pixelSpacing = 1, sessionId }) => {
  const [measuring, setMeasuring] = useState(false);
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [measurements, setMeasurements] = useState([]);
  
  // Add function to clear all measurements
  const clearAllMeasurements = useCallback(() => {
    setMeasurements([]);
    setStartPoint(null);
    setEndPoint(null);
    setMeasuring(false);
  }, []);
  
  // Add function to get measurements data for export
  const getMeasurementsData = useCallback(() => {
    return measurements;
  }, [measurements]);
  
  // Expose functions to parent component
  useEffect(() => {
    if (imageRef.current) {
      imageRef.current.clearMeasurements = clearAllMeasurements;
      imageRef.current.getMeasurementsData = getMeasurementsData;
    }
  }, [clearAllMeasurements, getMeasurementsData, imageRef]);

  const handleMouseDown = (e) => {
    if (!active) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setStartPoint({ x, y });
    setMeasuring(true);
  };

  const handleMouseMove = (e) => {
    if (!measuring || !active) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setEndPoint({ x, y });
  };

  const handleMouseUp = () => {
    if (!measuring || !active) return;
    if (startPoint && endPoint) {
      // Calcola la distanza in pixel
      const dx = endPoint.x - startPoint.x;
      const dy = endPoint.y - startPoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Converti in mm usando il pixelSpacing
      const realDistance = distance * pixelSpacing;
      
      setMeasurements(prev => [...prev, {
        start: startPoint,
        end: endPoint,
        distance: realDistance
      }]);
    }
    setMeasuring(false);
    setStartPoint(null);
    setEndPoint(null);
  };

  return (
    <>
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: active ? 'auto' : 'none',
          cursor: active ? 'crosshair' : 'default'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Linee di misurazione salvate */}
        {measurements.map((m, i) => (
          <g key={i}>
            {/* Effetto alone */}
            <line
              x1={m.start.x}
              y1={m.start.y}
              x2={m.end.x}
              y2={m.end.y}
              stroke="#000"
              strokeWidth="4"
              strokeOpacity="0.5"
            />
            {/* Linea principale */}
            <line
              x1={m.start.x}
              y1={m.start.y}
              x2={m.end.x}
              y2={m.end.y}
              stroke="#ff0000"
              strokeWidth="2"
            />
            {/* Punti di inizio e fine */}
            <circle
              cx={m.start.x}
              cy={m.start.y}
              r="3"
              fill="#ff0000"
              stroke="#000"
              strokeWidth="1"
            />
            <circle
              cx={m.end.x}
              cy={m.end.y}
              r="3"
              fill="#ff0000"
              stroke="#000"
              strokeWidth="1"
            />
            {/* Testo con sfondo */}
            <rect
              x={(m.start.x + m.end.x) / 2 - 30}
              y={(m.start.y + m.end.y) / 2 - 20}
              width="60"
              height="16"
              fill="rgba(0,0,0,0.7)"
              rx="3"
            />
            <text
              x={(m.start.x + m.end.x) / 2}
              y={(m.start.y + m.end.y) / 2 - 8}
              fill="#ffffff"
              fontSize="12px"
              textAnchor="middle"
              fontWeight="bold"
            >
              {m.distance.toFixed(1)} mm
            </text>
          </g>
        ))}
        
        {/* Linea di misurazione attiva */}
        {measuring && startPoint && endPoint && (
          <g>
            {/* Effetto alone */}
            <line
              x1={startPoint.x}
              y1={startPoint.y}
              x2={endPoint.x}
              y2={endPoint.y}
              stroke="#000"
              strokeWidth="4"
              strokeOpacity="0.5"
              strokeDasharray="4"
            />
            {/* Linea principale */}
            <line
              x1={startPoint.x}
              y1={startPoint.y}
              x2={endPoint.x}
              y2={endPoint.y}
              stroke="#ff0000"
              strokeWidth="2"
              strokeDasharray="4"
            />
            {/* Punti di inizio e fine */}
            <circle
              cx={startPoint.x}
              cy={startPoint.y}
              r="3"
              fill="#ff0000"
              stroke="#000"
              strokeWidth="1"
            />
            <circle
              cx={endPoint.x}
              cy={endPoint.y}
              r="3"
              fill="#ff0000"
              stroke="#000"
              strokeWidth="1"
            />
            {/* Testo con sfondo */}
            <rect
              x={(startPoint.x + endPoint.x) / 2 - 30}
              y={(startPoint.y + endPoint.y) / 2 - 20}
              width="60"
              height="16"
              fill="rgba(0,0,0,0.7)"
              rx="3"
            />
            <text
              x={(startPoint.x + endPoint.x) / 2}
              y={(startPoint.y + endPoint.y) / 2 - 8}
              fill="#ffffff"
              fontSize="12px"
              textAnchor="middle"
              fontWeight="bold"
            >
              {(Math.sqrt(
                Math.pow(endPoint.x - startPoint.x, 2) +
                Math.pow(endPoint.y - startPoint.y, 2)
              ) * pixelSpacing).toFixed(1)} mm
            </text>
          </g>
        )}
      </svg>
      
      {active && (
        <MeasurementControlPanel 
          measurements={measurements}
          onClearAll={clearAllMeasurements}
          imageRef={imageRef}
          sessionId={sessionId}
        />
      )}
    </>
  );
});

// New component for measurement controls with Apple-inspired design
const MeasurementControlPanel = React.memo(({ measurements, onClearAll, imageRef, sessionId }) => {
  // Generate a screenshot with measurements
  const exportImage = async () => {
    if (!imageRef.current || !sessionId) {
      console.error('Missing imageRef or sessionId');
      alert('Cannot export image at this time. Please try again.');
      return;
    }

    if (!measurements || measurements.length === 0) {
      console.error('No measurements to export');
      alert('No measurements to export. Please create at least one measurement first.');
      return;
    }

    try {
      console.log('Exporting measurements:', measurements);
      console.log('Session ID:', sessionId);
      const apiUrl = `${PYTHON_API_URL}/export_measurement/${sessionId}`;
      console.log('API URL:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          measurements: measurements,
          type: 'preprocessed' // o 'distorted' o 'denoised' a seconda dell'immagine corrente
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Export failed with status: ${response.status}, ${errorText}`);
      }

      // Get the blob from the response
      const blob = await response.blob();
      
      // Create a URL for the blob
      const url = window.URL.createObjectURL(blob);
      
      // Create a temporary link and click it to download
      const a = document.createElement('a');
      a.href = url;
      a.download = 'measurement_export.png';
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting image:', error);
      alert(`Failed to export image: ${error.message}`);
    }
  };
  
  // Generate a PDF report
  const generateReport = () => {
    // This would need integration with a PDF library
    // Placeholder for PDF generation functionality
    alert('PDF export feature coming soon!');
  };
  
  return (
    <div style={{
      position: 'absolute',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '10px 15px',
      borderRadius: '10px',
      backgroundColor: 'rgba(30, 30, 30, 0.8)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      boxShadow: '0 4px 30px rgba(0, 0, 0, 0.2)',
      zIndex: 100,
      color: 'white'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderRight: '1px solid rgba(255, 255, 255, 0.2)',
        paddingRight: '12px'
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 6H3M16 12H3M12 18H3M17 3l4 4-4 4"/>
        </svg>
        <div>
          <div style={{fontSize: '0.8rem', opacity: 0.7}}>Measurements</div>
          <div style={{fontWeight: 'bold'}}>{measurements.length}</div>
        </div>
      </div>
      
      <button onClick={onClearAll} style={{
        background: 'rgba(255, 59, 48, 0.2)',
        color: '#FF3B30',
        border: 'none',
        borderRadius: '6px',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '0.9rem',
        fontWeight: '500',
        cursor: 'pointer',
        transition: 'all 0.2s ease'
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
        Clear All
      </button>
      
      <button onClick={exportImage} style={{
        background: 'rgba(0, 122, 255, 0.2)',
        color: '#007AFF',
        border: 'none',
        borderRadius: '6px',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '0.9rem',
        fontWeight: '500',
        cursor: 'pointer',
        transition: 'all 0.2s ease'
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
        </svg>
        Export Image
      </button>
      
      <button onClick={generateReport} style={{
        background: 'rgba(52, 199, 89, 0.2)',
        color: '#34C759',
        border: 'none',
        borderRadius: '6px',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '0.9rem',
        fontWeight: '500',
        cursor: 'pointer',
        transition: 'all 0.2s ease'
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        PDF Report
      </button>
    </div>
  );
});

// --------------------------------------------------------------------
// Componente per la segmentazione
// --------------------------------------------------------------------
const SegmentationTool = React.memo(({ active, imageRef, onSegmentationComplete }) => {
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState([]);
  const [segments, setSegments] = useState([]);
  const [currentSegment, setCurrentSegment] = useState(null);
  const [selectedClass, setSelectedClass] = useState('tumor');
  const [currentColor, setCurrentColor] = useState('#ff0000');
  
  // Classi predefinite per la segmentazione
  const segmentationClasses = {
    tumor: { name: 'Tumor', color: '#ff0000' },
    organ: { name: 'Organ', color: '#00ff00' },
    lesion: { name: 'Lesion', color: '#0000ff' },
    tissue: { name: 'Tissue', color: '#ffff00' },
    custom: { name: 'Custom', color: '#ff00ff' }
  };

  const exportFormats = {
    json: {
      name: 'JSON',
      export: (segments) => {
        return JSON.stringify({
          version: '1.0',
          imageSize: {
            width: imageRef.current.naturalWidth,
            height: imageRef.current.naturalHeight
          },
          segments: segments.map(seg => ({
            points: seg.points,
            class: seg.class,
            color: seg.color,
            timestamp: new Date().toISOString()
          }))
        });
      }
    },
    coco: {
      name: 'COCO Format',
      export: (segments) => {
        return JSON.stringify({
          info: {
            year: new Date().getFullYear(),
            version: '1.0',
            description: 'BetaClarity Segmentation'
          },
          annotations: segments.map((seg, idx) => ({
            id: idx + 1,
            image_id: 1, // assumiamo una singola immagine
            category_id: Object.keys(segmentationClasses).indexOf(seg.class) + 1,
            segmentation: [seg.points.flatMap(p => [p.x, p.y])],
            area: calculatePolygonArea(seg.points),
            bbox: calculateBBox(seg.points),
            iscrowd: 0
          }))
        });
      }
    },
    mask: {
      name: 'Binary Mask',
      export: (segments) => {
        // Crea una maschera binaria usando canvas
        const canvas = document.createElement('canvas');
        canvas.width = imageRef.current.naturalWidth;
        canvas.height = imageRef.current.naturalHeight;
        const ctx = canvas.getContext('2d');
        
        segments.forEach(seg => {
          ctx.beginPath();
          ctx.moveTo(seg.points[0].x, seg.points[0].y);
          seg.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
          ctx.closePath();
          ctx.fill();
        });
        
        return canvas.toDataURL();
      }
    },
    yolo: {
      name: 'YOLO Format',
      export: (segments) => {
        return segments.map(seg => {
          const bbox = calculateBBox(seg.points);
          const classId = Object.keys(segmentationClasses).indexOf(seg.class);
          const x = (bbox.x + bbox.width/2) / imageRef.current.naturalWidth;
          const y = (bbox.y + bbox.height/2) / imageRef.current.naturalHeight;
          const w = bbox.width / imageRef.current.naturalWidth;
          const h = bbox.height / imageRef.current.naturalHeight;
          return `${classId} ${x} ${y} ${w} ${h}`;
        }).join('\n');
      }
    }
  };

  const calculatePolygonArea = (points) => {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
  };

  const calculateBBox = (points) => {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xs) - x;
    const height = Math.max(...ys) - y;
    return { x, y, width, height };
  };

  const exportSegmentation = (format, pointsToExport) => {
    const pts = pointsToExport || (segments.length > 0 ? segments[segments.length-1].points : points);
    if (!pts || pts.length < 3) {
      alert("Not enough points to create a valid segmentation");
      return;
    }
    
    // Get image dimensions for proper scaling
    const imgWidth = imageRef.current.naturalWidth;
    const imgHeight = imageRef.current.naturalHeight;
    
    let exportData;
    switch(format) {
      case 'coco':
        exportData = JSON.stringify({
          annotations: [{
            segmentation: [pts.flatMap(p => [p.x, p.y])],
            area: calculatePolygonArea(pts),
            bbox: calculateBBox(pts),
            category_id: 1, // Tumor by default
            image_id: 1,
            id: 1,
            iscrowd: 0
          }],
          categories: [
            {id: 1, name: segmentationClasses[selectedClass].name, supercategory: "medical"}
          ]
        });
        break;
      case 'yolo':
        const bbox = calculateBBox(pts);
        const centerX = (bbox.x + bbox.width/2) / imgWidth;
        const centerY = (bbox.y + bbox.height/2) / imgHeight;
        const normalizedWidth = bbox.width / imgWidth;
        const normalizedHeight = bbox.height / imgHeight;
        exportData = `0 ${centerX.toFixed(6)} ${centerY.toFixed(6)} ${normalizedWidth.toFixed(6)} ${normalizedHeight.toFixed(6)}`;
        break;
      case 'json':
        exportData = JSON.stringify({
          class: selectedClass,
          className: segmentationClasses[selectedClass].name,
          points: pts,
          imageDimensions: {width: imgWidth, height: imgHeight}
        });
        break;
      case 'mask':
        // Create binary mask using canvas
        const canvas = document.createElement('canvas');
        canvas.width = imgWidth;
        canvas.height = imgHeight;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fill();
        exportData = canvas.toDataURL('image/png');
        break;
      default:
        exportData = JSON.stringify({points: pts});
    }
    
    // Download the export data
    const blob = new Blob([exportData], {type: format === 'mask' ? 'image/png' : 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `segmentation.${format === 'mask' ? 'png' : format === 'yolo' ? 'txt' : 'json'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleMouseDown = (e) => {
    if (!active) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (drawing) {
      // Chiudi il contorno se clicchi vicino al punto iniziale
      const startPoint = points[0];
      const distance = Math.sqrt(
        Math.pow(x - startPoint.x, 2) + Math.pow(y - startPoint.y, 2)
      );
      
      if (distance < 20 && points.length > 2) {
        // Auto-complete the segmentation
        const completedPoints = [...points, startPoint];
        setSegments(prev => [...prev, {
          points: completedPoints,
          class: selectedClass,
          color: currentColor
        }]);
        setPoints([]);
        setDrawing(false);
        
        // Instead of confirm/prompt, notify the parent about completion
        if (onSegmentationComplete) {
          onSegmentationComplete(completedPoints);
        }
      } else {
        setPoints(prev => [...prev, { x, y }]);
      }
    } else {
      setPoints([{ x, y }]);
      setDrawing(true);
    }
  };

  const handleMouseMove = (e) => {
    if (!active || !drawing) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentSegment({ x, y });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setPoints([]);
      setDrawing(false);
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getPathFromPoints = (points) => {
    if (points.length < 2) return '';
    return `M ${points[0].x} ${points[0].y} ` + 
           points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
  };

  return (
    <>
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: active ? 'auto' : 'none',
          cursor: active ? 'crosshair' : 'default'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
      >
        {/* Segmenti completati */}
        {segments.map((segment, i) => (
          <g key={`segment-${i}`}>
            <path
              d={getPathFromPoints(segment.points)}
              fill={`${segment.color}33`}
              stroke={segment.color}
              strokeWidth="2"
            />
            <text
              x={segment.points[0].x}
              y={segment.points[0].y - 5}
              fill={segment.color}
              fontSize="12px"
            >
              {segmentationClasses[segment.class].name}
            </text>
          </g>
        ))}
        
        {/* Segmento corrente */}
        {drawing && (
          <>
            <path
              d={getPathFromPoints(points)}
              fill="none"
              stroke={currentColor}
              strokeWidth="2"
              strokeDasharray="4"
            />
            {currentSegment && (
              <line
                x1={points[points.length - 1].x}
                y1={points[points.length - 1].y}
                x2={currentSegment.x}
                y2={currentSegment.y}
                stroke={currentColor}
                strokeWidth="1"
                strokeDasharray="4"
              />
            )}
          </>
        )}
      </svg>
    </>
  );
});

// --------------------------------------------------------------------
// Image Preview
// --------------------------------------------------------------------
const ImagePreview = React.memo(({ src, alt, onClick, onZoomClick, measureMode, segmentMode, sessionId }) => {
  const [loaded, setLoaded] = useState(false);
  const imageRef = useRef(null);

  const handleImageClick = (e) => {
    if (!src || measureMode || segmentMode) return;
    
    if (e.button === 2) {
      e.preventDefault();
      const rect = imageRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      
      // Verifica che il click sia all'interno dell'immagine effettiva
      const img = imageRef.current;
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const containerRatio = rect.width / rect.height;
      
      let actualX = x;
      let actualY = y;
      
      if (imgRatio > containerRatio) {
        // L'immagine è limitata dalla larghezza
        const actualHeight = rect.width / imgRatio;
        const verticalPadding = (rect.height - actualHeight) / 2;
        actualY = (e.clientY - rect.top - verticalPadding) / actualHeight;
      } else {
        // L'immagine è limitata dall'altezza
        const actualWidth = rect.height * imgRatio;
        const horizontalPadding = (rect.width - actualWidth) / 2;
        actualX = (e.clientX - rect.left - horizontalPadding) / actualWidth;
      }

      // Verifica che il punto sia all'interno dell'immagine effettiva
      if (actualX >= 0 && actualX <= 1 && actualY >= 0 && actualY <= 1) {
        onZoomClick({ x: actualX, y: actualY });
      }
    } else {
      onClick(src);
    }
  };

  const handleSegmentationComplete = (points) => {
    // Qui puoi implementare il salvataggio o l'esportazione della segmentazione
    console.log('Segmentazione completata:', points);
    // Esempio: converti i punti in formato JSON
    const segmentationData = {
      points: points,
      timestamp: new Date().toISOString(),
      imageUrl: src
    };
    
    // Esempio: scarica come file JSON
    const blob = new Blob([JSON.stringify(segmentationData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'segmentation.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{ position: "relative", width: "100%", height: "100%" }}
      onMouseDown={handleImageClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      {src && (
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          style={{
            display: loaded ? "block" : "none",
            width: "100%",
            height: "100%",
            objectFit: "contain",
            cursor: measureMode || segmentMode ? "crosshair" : "pointer"
          }}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      )}
      <Ruler 
        active={measureMode} 
        imageRef={imageRef}
        pixelSpacing={0.2}
        sessionId={sessionId}
      />
      <SegmentationTool
        active={segmentMode}
        imageRef={imageRef}
        onSegmentationComplete={handleSegmentationComplete}
      />
      {!loaded && src && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#1a1a1a",
            color: "#666"
          }}
        >
          Loading...
        </div>
      )}
    </div>
  );
});

// --------------------------------------------------------------------
// Fullscreen Overlay
// --------------------------------------------------------------------
const FullscreenOverlay = React.memo(({ src, onClose }) => {
  if (!src) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.9)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
      onClick={onClose}
    >
      <img
        src={src}
        alt="Fullscreen"
        style={{ maxWidth: "90%", maxHeight: "90%" }}
      />
    </div>
  );
});

// --------------------------------------------------------------------
// Zoomed Thumbnails
// --------------------------------------------------------------------
const ZoomedThumbnail = React.memo(({ url, zoomPoint, zoomLevel, width, height }) => {
  if (!url) return null;
  const { x, y } = zoomPoint;
  return (
    <div
      style={{
        position: "relative",
        width: width || "120px",
        height: height || "120px",
        border: "1px solid #444",
        borderRadius: "6px",
        overflow: "hidden",
        flex: 1
      }}
    >
      <img
        src={url}
        alt="zoom"
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${zoomLevel}) translate(${-x * 100}%, ${-y * 100}%)`,
          transformOrigin: "left top"
        }}
      />
    </div>
  );
});

const ZoomWindow = React.memo(
  ({ visible, zoomPoint, onClose, originalUrl, distortedUrl, denoisedUrl }) => {
    const {
      windowRef,
      position,
      size,
      onMouseDownBar,
      onMouseDownResize
    } = useDraggableResizable({ x: 100, y: 100 }, { width: 400, height: 220 });

    if (!visible || !zoomPoint) return null;

    const zoomLevel = 3;
    const panelStyle = {
      position: "fixed",
      left: position.x,
      top: position.y,
      width: size.width,
      height: size.height,
      backgroundColor: "#1a1a1a",
      border: "1px solid #333",
      borderRadius: "6px",
      zIndex: 9999,
      boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
      display: "flex",
      flexDirection: "column"
    };
    const headerStyle = {
      height: "24px",
      backgroundColor: "#2a2a2a",
      cursor: "grab",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 8px"
    };
    const bodyStyle = {
      flex: 1,
      overflow: "auto",
      padding: "8px",
      display: "flex",
      gap: "10px",
      minHeight: 0
    };

    const thumbnailHeight = size.height - 40;
    const thumbnailWidth = (size.width - 36) / 3;

    const labelStyle = {
      position: "absolute",
      top: "4px",
      left: "4px",
      backgroundColor: "rgba(0,0,0,0.7)",
      color: "#fff",
      padding: "2px 6px",
      borderRadius: "4px",
      fontSize: "0.8rem",
      zIndex: 1
    };

    return (
      <div ref={windowRef} style={panelStyle}>
        <div style={headerStyle} onMouseDown={onMouseDownBar}>
          <span style={{ color: "#bbb", fontSize: "0.85rem" }}>
            Drag to move (Zoom Window)
          </span>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              fontSize: "16px",
              fontWeight: "bold"
            }}
          >
            ×
          </button>
        </div>
        <div style={bodyStyle}>
          {/* Original */}
          <div style={{ position: "relative", flex: 1 }}>
            <div style={labelStyle}>Original</div>
            <ZoomedThumbnail
              url={originalUrl}
              zoomPoint={zoomPoint}
              zoomLevel={zoomLevel}
              width={thumbnailWidth}
              height={thumbnailHeight}
            />
          </div>
          {/* Distorted */}
          <div style={{ position: "relative", flex: 1 }}>
            <div style={labelStyle}>Distorted</div>
            <ZoomedThumbnail
              url={distortedUrl}
              zoomPoint={zoomPoint}
              zoomLevel={zoomLevel}
              width={thumbnailWidth}
              height={thumbnailHeight}
            />
          </div>
          {/* Enhanced */}
          <div style={{ position: "relative", flex: 1 }}>
            <div style={labelStyle}>Enhanced</div>
            <ZoomedThumbnail
              url={denoisedUrl}
              zoomPoint={zoomPoint}
              zoomLevel={zoomLevel}
              width={thumbnailWidth}
              height={thumbnailHeight}
            />
          </div>
        </div>
        <div
          onMouseDown={onMouseDownResize}
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: "16px",
            height: "16px",
            cursor: "nwse-resize",
            backgroundColor: "#444"
          }}
        />
      </div>
    );
  }
);

// --------------------------------------------------------------------
// PSNR/SSIM Window
// --------------------------------------------------------------------
const PsnrWindow = React.memo(({ visible, minimized, onClose, onMinimize, dataSets }) => {
  const { windowRef, position, size, onMouseDownBar, onMouseDownResize } = 
    useDraggableResizable({ x: 100, y: 100 }, { width: 400, height: 300 }); // Posizione più visibile

  if (!visible) return null;

  return (
    <div 
      ref={windowRef} 
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width: minimized ? 220 : size.width,
        height: minimized ? 40 : size.height,
        backgroundColor: "#1a1a1a",
        border: "1px solid #00ff00", // Bordo più visibile
        borderRadius: "6px",
        zIndex: 9999,
        boxShadow: "0 0 20px rgba(0,255,0,0.2)", // Glow effect
        display: "flex",
        flexDirection: "column"
      }}
    >
      <div 
        style={{
          height: "24px",
          backgroundColor: "#2a2a2a",
          cursor: "grab",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 8px"
        }}
        onMouseDown={onMouseDownBar}
      >
        <span style={{ color: "#bbb", fontSize: "0.85rem" }}>PSNR/SSIM Metrics</span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            onClick={onMinimize}
            style={{
              background: "transparent",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              fontSize: "16px"
            }}
          >
            {minimized ? "🗗" : "—"}
          </button>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              fontSize: "16px"
            }}
          >
            ×
          </button>
        </div>
      </div>
      
      {!minimized && (
        <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
          {dataSets && dataSets.length > 0 ? (
            dataSets.map((ds, i) => (
              <div
                key={i}
                style={{
                  backgroundColor: "#222",
                  borderRadius: "4px",
                  padding: "16px",
                  marginBottom: "16px"
                }}
              >
                <h4 style={{ margin: "0 0 12px 0", color: "#fff" }}>{ds.label}</h4>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    backgroundColor: "#1a1a1a",
                    padding: "12px",
                    borderRadius: "4px"
                  }}
                >
                  <div style={{ textAlign: "center", flex: 1 }}>
                    <div style={{
                      color: "rgba(96,150,255,0.8)",
                      fontSize: "24px",
                      fontWeight: "bold"
                    }}>
                      {ds.metrics?.psnr?.toFixed(2) ?? "N/A"}
                    </div>
                    <div style={{ color: "#888", fontSize: "14px", marginTop: "4px" }}>
                      PSNR (dB)
                    </div>
                  </div>
                  <div style={{ textAlign: "center", flex: 1 }}>
                    <div style={{
                      color: "rgba(255,196,0,0.8)",
                      fontSize: "24px",
                      fontWeight: "bold"
                    }}>
                      {ds.metrics?.ssim?.toFixed(3) ?? "N/A"}
                    </div>
                    <div style={{ color: "#888", fontSize: "14px", marginTop: "4px" }}>
                      SSIM
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p style={{ color: "#888", textAlign: "center" }}>No metrics available</p>
          )}
        </div>
      )}
      
      {!minimized && (
        <div
          onMouseDown={onMouseDownResize}
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: "16px",
            height: "16px",
            cursor: "nwse-resize",
            backgroundColor: "#444"
          }}
        />
      )}
    </div>
  );
});

// --------------------------------------------------------------------
// Model Panel (BetaSR or BetaVision)
// --------------------------------------------------------------------
const ModelPanel = React.memo(({ visible, onClose, selectedModel, onSelectModel }) => {
  const { windowRef, position, size, onMouseDownBar, onMouseDownResize } =
    useDraggableResizable({ x: 200, y: 100 }, { width: 280, height: 320 });

  if (!visible) return null;

  const panelStyle = {
    position: "fixed",
    left: position.x,
    top: position.y,
    width: size.width,
    height: size.height,
    backgroundColor: "#1a1a1a",
    border: "1px solid #333",
    borderRadius: "6px",
    zIndex: 9999,
    boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
    display: "flex",
    flexDirection: "column"
  };
  const headerStyle = {
    height: "24px",
    backgroundColor: "#2a2a2a",
    cursor: "grab",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 8px"
  };
  const contentStyle = {
    flex: 1,
    overflow: "auto",
    padding: "8px"
  };

  return (
    <div ref={windowRef} style={panelStyle}>
      <div style={headerStyle} onMouseDown={onMouseDownBar}>
        <span style={{ color: "#bbb", fontSize: "0.85rem" }}>Select Model</span>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "#fff",
            cursor: "pointer",
            fontSize: "16px",
            fontWeight: "bold"
          }}
        >
          ×
        </button>
      </div>
      <div style={contentStyle}>
        <h4 style={{ color: "#fff" }}>Denoising / Super-Resolution</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label
            style={{ color: "#ccc", display: "flex", gap: "6px", alignItems: "center" }}
          >
            <input
              type="radio"
              name="model"
              checked={selectedModel === "betasr"}
              onChange={() => onSelectModel("betasr")}
            />
            BetaSR v1
          </label>
        </div>

        <hr style={{ borderColor: "#444", margin: "12px 0" }} />

        <h4 style={{ color: "#fff" }}>Vision Q&A</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label
            style={{ color: "#ccc", display: "flex", gap: "6px", alignItems: "center" }}
          >
            <input
              type="radio"
              name="model"
              checked={selectedModel === "betavision"}
              onChange={() => onSelectModel("betavision")}
            />
            BetaVision v1
          </label>
        </div>
      </div>
      <div
        onMouseDown={onMouseDownResize}
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          width: "16px",
          height: "16px",
          cursor: "nwse-resize",
          backgroundColor: "#444"
        }}
      />
    </div>
  );
});

// --------------------------------------------------------------------
// Chat Window
// --------------------------------------------------------------------
const ChatInput = React.memo(({ onSendMessage }) => {
  const [inputVal, setInputVal] = useState("");

  const handleInputKeyDown = (e) => {
    if (e.key === "Enter") sendMessage();
  };

  const sendMessage = () => {
    const text = inputVal.trim();
    if (!text) return;
    onSendMessage(text);
    setInputVal("");
  };

  return (
    <div style={{ display: "flex", gap: "6px", padding: "8px" }}>
      <input
        type="text"
        placeholder="Type and press Enter..."
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={handleInputKeyDown}
        style={{
          flex: 1,
          backgroundColor: "#333",
          color: "#fff",
          borderRadius: "6px",
          border: "1px solid #444",
          padding: "8px"
        }}
      />
      <button
        onClick={sendMessage}
        style={{
          backgroundColor: "#147ce5",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          padding: "8px 14px",
          fontSize: "0.85rem",
          fontWeight: 500,
          cursor: "pointer"
        }}
      >
        Send
      </button>
    </div>
  );
});

const ChatWindow = React.memo(
  ({ visible, minimized, onClose, onMinimize, model, messages, onSendMessage }) => {
    const {
      windowRef,
      position,
      size,
      onMouseDownBar,
      onMouseDownResize
    } = useDraggableResizable({ x: 60, y: 400 }, { width: 320, height: 300 });

    if (!visible) return null;

    const panelStyle = {
      position: "fixed",
      left: position.x,
      top: position.y,
      width: minimized ? 220 : size.width,
      height: minimized ? 40 : size.height,
      backgroundColor: "#111",
      border: "1px solid #333",
      borderRadius: "6px",
      zIndex: 9999,
      boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
      display: "flex",
      flexDirection: "column"
    };
    const headerStyle = {
      height: "24px",
      backgroundColor: "#2a2a2a",
      cursor: "grab",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 8px"
    };
    const chatBoxStyle = {
      flex: 1,
      overflowY: "auto",
      padding: "8px"
    };

    return (
      <div ref={windowRef} style={panelStyle}>
        <div style={headerStyle} onMouseDown={onMouseDownBar}>
          <span style={{ fontSize: "0.85rem", color: "#ccc" }}>
            {model === "betavision" ? "BetaVision v1" : "BetaSR v1"} Chat
          </span>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={onMinimize}
              style={{
                background: "transparent",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                fontSize: "16px",
                fontWeight: "bold"
              }}
            >
              {minimized ? "🗗" : "—"}
            </button>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                fontSize: "16px",
                fontWeight: "bold"
              }}
            >
              ×
            </button>
          </div>
        </div>
        {!minimized && (
          <>
            <div style={chatBoxStyle}>
              {messages.length === 0 ? (
                <div style={{ color: "#666" }}>No conversation yet</div>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      marginBottom: "6px",
                      padding: "6px",
                      borderRadius: "4px",
                      backgroundColor:
                        msg.role === "assistant" ? "#333" : "transparent",
                      fontSize: "0.9rem"
                    }}
                  >
                    <strong
                      style={{
                        color: msg.role === "assistant" ? "#0bf0a0" : "#ffd700"
                      }}
                    >
                      {msg.role === "assistant" ? "Assistant" : "You"}:
                    </strong>{" "}
                    <span style={{ color: "#fff" }}>{msg.text}</span>
                  </div>
                ))
              )}
            </div>
            <ChatInput onSendMessage={onSendMessage} />
            <div
              onMouseDown={onMouseDownResize}
              style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                width: "16px",
                height: "16px",
                cursor: "nwse-resize",
                backgroundColor: "#444"
              }}
            />
          </>
        )}
      </div>
    );
  }
);

// --------------------------------------------------------------------
// Main Component: BetaClarityApp
// --------------------------------------------------------------------
function BetaClarityApp() {
  const navigate = useNavigate(); // remove if not using react-router

  // 🔧 DEBUG: Component loaded
  console.log('🔧 BETACLARITY STARTUP: BetaClarityApp component loaded at', new Date().toISOString());
  
  // 🔧 IMMEDIATE TRANSFER: Check localStorage right now!
  setTimeout(() => {
    console.log('🔧 IMMEDIATE TRANSFER: Running immediate localStorage check...');
    const immediateTransfer = localStorage.getItem('betasr_transfer_image');
    console.log('🔧 IMMEDIATE TRANSFER: Found data:', !!immediateTransfer);
    if (immediateTransfer) {
      try {
        const parsed = JSON.parse(immediateTransfer);
        console.log('🔧 IMMEDIATE TRANSFER: Loading image:', parsed.imageName);
        
        // Set image immediately
        setOriginalUrl(parsed.imageData);
        
        // Add chat message
        setChatMessages(prev => [...prev, {
          id: Date.now(),
          role: 'assistant',
          content: `✅ **Auto-loaded from Medical Interface**\n\n**File:** ${parsed.imageName}\n**Size:** ${(parsed.imageSize / 1024).toFixed(1)} KB\n\nReady for distortion and enhancement!`,
          timestamp: new Date().toISOString()
        }]);
        
        // Clear localStorage
        localStorage.removeItem('betasr_transfer_image');
        console.log('✅ IMMEDIATE TRANSFER: Image loaded and localStorage cleared');
        
      } catch (e) {
        console.error('❌ IMMEDIATE TRANSFER: Error:', e);
      }
    }
  }, 500); // Wait 500ms for component to be fully mounted
  
  // 🔧 DEBUG: Immediate localStorage check
  console.log('🔧 BETACLARITY STARTUP: Checking localStorage immediately...');
  const immediateCheck = localStorage.getItem('betasr_transfer_image');
  console.log('🔧 BETACLARITY STARTUP: localStorage data found:', !!immediateCheck);
  if (immediateCheck) {
    try {
      const parsed = JSON.parse(immediateCheck);
      console.log('🔧 BETACLARITY STARTUP: Parsed data:', {
        name: parsed.imageName,
        size: parsed.imageSize,
        dataLength: parsed.imageData?.length || 0
      });
    } catch (e) {
      console.error('🔧 BETACLARITY STARTUP: Parse error:', e);
    }
  }

  const {
    progress,
    setProgress,
    processing,
    setProcessing,
    progressMessage,
    setProgressMessage
  } = useProcessing();

  const [sessionId, setSessionId] = useState(null);
  const [modelPanelVisible, setModelPanelVisible] = useState(false);
  const [selectedModel, setSelectedModel] = useState("betasr"); // "betasr" or "betavision"
  const [chatVisible, setChatVisible] = useState(false);
  const [chatMinimized, setChatMinimized] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [psnrVisible, setPsnrVisible] = useState(false);
  const [psnrMinimized, setPsnrMinimized] = useState(false);

  const [zoomPoint, setZoomPoint] = useState(null);
  const [fullscreenSrc, setFullscreenSrc] = useState(null);

  // Distortion/Enhancement settings
  const [showMetrics, setShowMetrics] = useState(false);
  const [distortionType, setDistortionType] = useState("gaussian");
  const [distortionLevel, setDistortionLevel] = useState(0.25);
  const [scaleFactor, setScaleFactor] = useState(4);
  const [enhancementLevel, setEnhancementLevel] = useState(1);
  const [ddimSteps, setDdimSteps] = useState(100);
  const [eta, setEta] = useState(0.0);

  // Images
  const [originalUrl, setOriginalUrl] = useState(null);
  const [distortedUrl, setDistortedUrl] = useState(null);
  const [denoisedUrl, setDenoisedUrl] = useState(null);

  // Metrics
  const [originalMetrics, setOriginalMetrics] = useState(null);
  const [distortedMetrics, setDistortedMetrics] = useState(null);
  const [denoisedMetrics, setDenoisedMetrics] = useState(null);

  // Modality
  const MODALITIES = [
    "Brain MRI",
    "Breast MRI",
    "Cardiac MRI",
    "Cardiac US",
    "Chest X-Ray",
    "Knee MRI"
  ];
  const [selectedModality, setSelectedModality] = useState(MODALITIES[0]);
  const [sampleImages, setSampleImages] = useState([]);
  const [loadingImageId, setLoadingImageId] = useState(null);

  // File input ref
  const fileInputRef = useRef(null);

  // Aggiungi questo stato all'inizio del componente BetaClarityApp
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportType, setReportType] = useState(null);
  const [aiReportVisible, setAIReportVisible] = useState(false);

  // Aggiungi questo stato all'inizio del componente
  const [initialPrompt, setInitialPrompt] = useState("");

  // Aggiungi questo stato nel componente principale
  const [isModelsPanelOpen, setIsModelsPanelOpen] = useState(false);

  // ── Hardware / system info ──────────────────────────────────────────
  const [systemInfo, setSystemInfo] = useState(null);
  const refreshSystemInfo = React.useCallback(() => {
    fetch(`${PYTHON_API_URL}/api/system-info`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSystemInfo(data); })
      .catch(() => {});
  }, []);
  useEffect(() => { refreshSystemInfo(); }, [refreshSystemInfo]);

  // ── Hardware selector + active device/model ─────────────────────────
  const [devicesInfo, setDevicesInfo] = useState(null); // { devices, active_device, models, active_model }
  const refreshDevices = React.useCallback(() => {
    fetch(`${PYTHON_API_URL}/api/devices`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setDevicesInfo(data); })
      .catch(() => {});
  }, []);
  useEffect(() => { refreshDevices(); }, [refreshDevices]);

  const handleSelectDevice = async (deviceId) => {
    try {
      const r = await fetch(`${PYTHON_API_URL}/api/select-device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: deviceId }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(`Cannot switch device: ${j.error}\n\n${j.hint || ''}`);
      } else {
        refreshDevices();
        refreshSystemInfo();
      }
    } catch (err) {
      console.error('select-device failed', err);
    }
  };

  const handleSelectModel = async (modelId) => {
    try {
      const r = await fetch(`${PYTHON_API_URL}/api/select-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(`Cannot switch model: ${j.error}\n\n${j.hint || ''}`);
      } else {
        refreshDevices();
        refreshSystemInfo();
      }
    } catch (err) {
      console.error('select-model failed', err);
    }
  };

  // ── Live HW activity monitor (polled while denoising) ───────────────
  const [activityStats, setActivityStats] = useState(null); // { samples, session, interval_ms }
  const [isInferencing, setIsInferencing] = useState(false);
  useEffect(() => {
    if (!isInferencing) return;
    let mounted = true;
    const tick = () => {
      fetch(`${PYTHON_API_URL}/api/inference-stats?last_n=40`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (mounted && data) setActivityStats(data); })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 700);
    return () => { mounted = false; clearInterval(id); };
  }, [isInferencing]);

  // Aggiungi questo stato all'inizio del componente principale
  const [showDebugMetrics, setShowDebugMetrics] = useState(false);

  // All'inizio del componente principale, aggiungi gli stati mancanti:
  const [showSegmentInstructions, setShowSegmentInstructions] = useState(false);
  const [segmentPoints, setSegmentPoints] = useState([]);
  const [segmentComplete, setSegmentComplete] = useState(false);
  const [segmentMode, setSegmentMode] = useState(false);
  const [segmentationStats, setSegmentationStats] = useState(null);
  const [exportFormat, setExportFormat] = useState('png');
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  // Aggiungi questa funzione per gestire il toggle della segmentazione
  const handleSegmentationToggle = () => {
    const newState = !segmentMode;
    setSegmentMode(newState);
    
    // Se viene attivata, mostra automaticamente le istruzioni la prima volta
    if (newState && segmentPoints.length === 0) {
      setShowSegmentInstructions(true);
    }
    
    // Se viene disattivata, resetta lo stato
    if (!newState) {
      resetSegmentation();
    }
  };

  // Funzione per completare la segmentazione
  const completeSegmentation = () => {
    if (segmentPoints.length < 3) {
      alert("You need at least 3 points to complete the segmentation");
      return;
    }
    
    setSegmentComplete(true);
    
    // Calcola le statistiche
    const stats = calculateSegmentationStats();
    setSegmentationStats(stats);
  };

  // Funzione per resettare completamente la segmentazione
  const resetSegmentation = () => {
    setSegmentPoints([]);
    setSegmentComplete(false);
    setSegmentationStats(null);
  };

  // Funzione per esportare la segmentazione in vari formati
  const exportSegmentation = (format) => {
    if (!segmentComplete) {
      alert("Please complete the segmentation first");
      return;
    }
    
    const img = new Image();
    img.src = originalUrl || denoisedUrl || distortedUrl;
    
    switch(format) {
      case 'png':
        exportAsPNG();
        break;
      case 'json':
        exportAsJSON();
        break;
      case 'dicom':
        exportForDicom();
        break;
      case 'csv':
        exportAsCSV();
        break;
      default:
        exportAsPNG();
    }
  };

  // Esporta come immagine PNG
  const exportAsPNG = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Disegna l'immagine originale
      ctx.drawImage(img, 0, 0);
      
      // Disegna la segmentazione
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
      
      // Disegna il poligono
      ctx.beginPath();
      segmentPoints.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point.x * img.width, point.y * img.height);
        } else {
          ctx.lineTo(point.x * img.width, point.y * img.height);
        }
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Aggiungi statistiche
      if (segmentationStats) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(10, 10, 300, 120);
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.fillText(`Area: ${segmentationStats.areaMm2.toFixed(2)} mm²`, 20, 30);
        ctx.fillText(`Perimeter: ${segmentationStats.perimeterMm.toFixed(2)} mm`, 20, 50);
        ctx.fillText(`Points: ${segmentationStats.numPoints}`, 20, 70);
        ctx.fillText(`W × H: ${segmentationStats.boundingBox.width.toFixed(1)} × ${segmentationStats.boundingBox.height.toFixed(1)} px`, 20, 90);
        ctx.fillText(`ROI Segmentation - BetaClarity`, 20, 110);
      }
      
      // Scarica l'immagine
      const dataURL = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataURL;
      a.download = 'segmentation_result.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    
    img.src = denoisedUrl || distortedUrl || originalUrl;
  };

  // Esporta come JSON
  const exportAsJSON = () => {
    const jsonData = {
      imageSource: denoisedUrl || distortedUrl || originalUrl,
      segmentationType: "ROI",
      timestamp: new Date().toISOString(),
      points: segmentPoints.map(p => ({ 
        x: p.x, 
        y: p.y,
        pixelX: p.actualX,
        pixelY: p.actualY 
      })),
      statistics: segmentationStats
    };
    
    const blob = new Blob([JSON.stringify(jsonData, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'segmentation_data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Esporta come CSV
  const exportAsCSV = () => {
    let csvContent = "x,y,pixel_x,pixel_y\n";
    segmentPoints.forEach(p => {
      csvContent += `${p.x},${p.y},${p.actualX},${p.actualY}\n`;
    });
    
    const blob = new Blob([csvContent], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'segmentation_points.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Esporta in formato compatibile con DICOM
  const exportForDicom = () => {
    const dicomData = {
      SOPClassUID: "1.2.840.10008.5.1.4.1.1.7", // Secondary Capture Image Storage
      ContourData: segmentPoints.map(p => [p.actualX, p.actualY, 0]),
      ContourGeometricType: "CLOSED_PLANAR",
      NumberOfContourPoints: segmentPoints.length,
      ROIDisplayColor: [0, 255, 0],
      ReferencedImageSequence: {
        ReferencedSOPClassUID: "1.2.840.10008.5.1.4.1.1.7",
        ReferencedSOPInstanceUID: "1.2.3.4.5.6.7.8.9.0"
      },
      SegmentationType: "MANUAL",
      AreaMm2: segmentationStats?.areaMm2 || 0,
      PerimeterMm: segmentationStats?.perimeterMm || 0
    };
    
    const jsonString = JSON.stringify(dicomData, null, 2);
    const blob = new Blob([jsonString], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dicom_segmentation.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    alert("DICOM-compatible format exported. Use a DICOM converter tool to finalize.");
  };

  // Create session on mount
  useEffect(() => {
    async function createSession() {
      try {
        const resp = await fetch(`${PYTHON_API_URL}/create_session`, {
          method: "POST"
        });
        if (!resp.ok) throw new Error("Session creation failed");
        const data = await resp.json();
        setSessionId(data.session_id);
      } catch (err) {
        console.error("createSession error:", err);
      }
    }
    createSession();
  }, []);

  // Function to upload transferred image data to backend
  const uploadTransferredImage = async (imageData) => {
    try {
      resetImages();
      setProcessing(true);
      setProgressMessage("UPLOADING TRANSFERRED IMAGE...");
      setProgress(10);

      // Convert base64 to blob
      const response = await fetch(imageData.imageData);
      const blob = await response.blob();
      
      // Create a file from the blob
      const file = new File([blob], imageData.imageName, {
        type: imageData.imageType || 'image/jpeg'
      });

      console.log('🔧 BETACLARITY DEBUG: Created file from transferred data:', {
        name: file.name,
        size: file.size,
        type: file.type
      });

      // Upload to backend like normal file upload
      const formData = new FormData();
      formData.append("file", file);
      formData.append("session_id", sessionId);

      const resp = await fetch(`${PYTHON_API_URL}/upload_file`, {
        method: "POST",
        body: formData
      });

      if (!resp.ok) {
        const errData = await resp.json();
        throw new Error(`Upload failed: ${errData.error || "Unknown error"}`);
      }

      setProgressMessage("LOADING ORIGINAL...");
      setProgress(50);

      // Load the processed image from backend
      const orig = `${PYTHON_API_URL}/get_preprocessed/${sessionId}?t=${Date.now()}`;
      setOriginalUrl(orig);
      await computeMetrics("preprocessed", setOriginalMetrics);

      setProgressMessage("DONE");
      setProgress(100);

      // Mark successful transfer
      window.lastSuccessfulTransfer = Date.now();
      window.lastProcessedImageName = imageData.imageName;
      
      // Add success message
      const successMessage = {
        id: Date.now(),
        role: 'assistant',
        content: `✅ **Image ready for processing!**\n\nYou can now use Distortion and Enhancement controls.`,
        timestamp: new Date().toISOString()
      };
      setChatMessages(prev => [...prev, successMessage]);

    } catch (error) {
      console.error("Transfer upload error:", error);
      setProgressMessage(`ERROR: ${error.message}`);
      setProgress(0);
      
      const errorMessage = {
        id: Date.now(),
        role: 'assistant',
        content: `❌ **Error uploading transferred image:** ${error.message}`,
        timestamp: new Date().toISOString()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setTimeout(() => {
        setProcessing(false);
        setProgressMessage("IDLE");
        setProgress(0);
      }, 1200);
    }
  };

  // Function to check for transferred image from URL parameters and setup PostMessage listener
  const checkForTransferredImage = () => {
    console.log('🔧 BETACLARITY DEBUG: Checking for transferred image...');
    
    try {
      // Check if this is a PostMessage transfer
      const urlParameters = new URLSearchParams(window.location.search);
      const transferType = urlParameters.get('transfer');
      
      if (transferType === 'postmessage') {
        console.log('🔧 BETACLARITY DEBUG: PostMessage transfer detected, setting up listener...');
        
        // Setup PostMessage listener for image data
        const handlePostMessage = (event) => {
          console.log('🔧 BETACLARITY DEBUG: Received PostMessage:', event.origin);
          
          // Verify origin for security
          if (event.origin !== 'http://localhost:8080') {
            console.log('⚠️ BETACLARITY DEBUG: Ignored message from untrusted origin:', event.origin);
            return;
          }
          
          const data = event.data;
          if (data && data.type === 'BETASR_IMAGE_TRANSFER') {
            console.log('✅ BETACLARITY DEBUG: Valid image transfer received via PostMessage:', {
              imageName: data.imageName,
              imageSize: data.imageSize,
              transferTime: new Date(data.transferTime).toISOString(),
              dataLength: data.imageData ? data.imageData.length : 0
            });
            
            console.log('🔧 BETACLARITY DEBUG: Processing PostMessage transfer...', {
              hasOriginalUrl: !!originalUrl,
              lastSuccessfulTransfer: window.lastSuccessfulTransfer,
              dataName: data.imageName
            });
            
            // Only check for duplicates if we already processed this specific image
            if (window.lastProcessedImageName === data.imageName && originalUrl) {
              console.log('🔧 BETACLARITY DEBUG: Same image already processed, ignoring');
              return;
            }
            
            // Load the image into backend for processing
            console.log('🔧 BETACLARITY DEBUG: Uploading transferred image to backend...');
            uploadTransferredImage(data);
             
             // Add success message
             const autoLoadMessage = {
               id: Date.now(),
               role: 'assistant',
               content: `✅ **Image automatically loaded from Medical Interface**\n\n**File:** ${data.imageName}\n**Size:** ${(data.imageSize / 1024).toFixed(1)} KB\n**Source:** ${data.sourceInterface}\n**Transfer Time:** ${new Date(data.transferTime).toLocaleTimeString()}\n\n🔧 **SUCCESS:** Image transferred via PostMessage\n\nProcessing image for distortion correction and enhancement...`,
               timestamp: new Date().toISOString()
             };
             setChatMessages(prev => [...prev, autoLoadMessage]);
            
            // Remove listener after successful transfer
            window.removeEventListener('message', handlePostMessage);
            console.log('✅ BETACLARITY DEBUG: PostMessage transfer completed, listener removed');
          }
        };
        
        // Add the PostMessage listener
        window.addEventListener('message', handlePostMessage);
        console.log('✅ BETACLARITY DEBUG: PostMessage listener added');
        
        // Clean up listener after 10 seconds if no message received
        setTimeout(() => {
          window.removeEventListener('message', handlePostMessage);
          console.log('🔧 BETACLARITY DEBUG: PostMessage listener timeout, removed');
        }, 10000);
        
        return false; // Don't continue checking other methods
      }
      
      // Fallback: check URL parameters
      const urlSearchParams = new URLSearchParams(window.location.search);
      const transferParam = urlSearchParams.get('transfer');
      
      console.log('🔧 BETACLARITY DEBUG: URL transfer parameter found:', !!transferParam);
      
      if (transferParam) {
        console.log('🔧 BETACLARITY DEBUG: Decoding URL transfer data...');
        
        // Decode base64 data from URL
        const decodedString = decodeURIComponent(escape(atob(decodeURIComponent(transferParam))));
        const compactData = JSON.parse(decodedString);
        
        // Convert back to original format
        const imageData = {
          imageData: compactData.d,
          imageName: compactData.n,
          imageSize: compactData.s,
          imageType: compactData.t,
          transferTime: compactData.ts,
          sourceInterface: 'betavisionqa-medical'
        };
        
        console.log('🔧 BETACLARITY DEBUG: URL transfer data decoded:', {
          imageName: imageData.imageName,
          imageSize: imageData.imageSize,
          transferTime: new Date(imageData.transferTime).toISOString(),
          sourceInterface: imageData.sourceInterface,
          dataLength: imageData.imageData ? imageData.imageData.length : 0
        });
        
        // Check if transfer is recent (within 5 minutes)
        const transferAge = Date.now() - imageData.transferTime;
        console.log('🔧 BETACLARITY DEBUG: Transfer age:', transferAge, 'ms');
        
        if (transferAge < 5 * 60 * 1000) { // 5 minutes
          console.log('✅ BETACLARITY DEBUG: Auto-loading transferred image:', imageData.imageName);
          
          // Set the image as original
          setOriginalUrl(imageData.imageData);
          console.log('✅ BETACLARITY DEBUG: setOriginalUrl called with data length:', imageData.imageData.length);
          
          // Add chat message about auto-loaded image
          const autoLoadMessage = {
            id: Date.now(),
            role: 'assistant',
            content: `✅ **Image automatically loaded from Medical Interface**\n\n**File:** ${imageData.imageName}\n**Size:** ${(imageData.imageSize / 1024).toFixed(1)} KB\n**Source:** BetaVisionQA Medical Interface\n**Transfer Time:** ${new Date(imageData.transferTime).toLocaleTimeString()}\n\n🔧 **SUCCESS:** Image transferred via URL parameters (${imageData.imageData.length} chars)\n\nYou can now proceed with distortion and enhancement using the structured BetaSR interface.`,
            timestamp: new Date().toISOString()
          };
          setChatMessages(prev => [...prev, autoLoadMessage]);
          console.log('✅ BETACLARITY DEBUG: Chat message added');
          
          // Remove URL parameter to clean up
          const cleanUrl = new URL(window.location);
          cleanUrl.searchParams.delete('transfer');
          window.history.replaceState({}, document.title, cleanUrl);
          console.log('✅ BETACLARITY DEBUG: URL cleaned up');
          
          return true; // Image was loaded
        } else {
          console.log('⚠️ BETACLARITY DEBUG: Transfer too old, ignoring');
        }
      }
      
      // Also check window.BETASR_PENDING_TRANSFER (set by HTML script)
      if (window.BETASR_PENDING_TRANSFER) {
        console.log('🔧 BETACLARITY DEBUG: Found pending transfer from HTML script');
        const imageData = window.BETASR_PENDING_TRANSFER;
        
        // Clear the pending transfer
        delete window.BETASR_PENDING_TRANSFER;
        
        console.log('✅ BETACLARITY DEBUG: Loading image from pending transfer:', imageData.imageName);
        setOriginalUrl(imageData.imageData);
        
        const autoLoadMessage = {
          id: Date.now(),
          role: 'assistant',
          content: `✅ **Image automatically loaded from Medical Interface**\n\n**File:** ${imageData.imageName}\n**Size:** ${(imageData.imageSize / 1024).toFixed(1)} KB\n**Source:** BetaVisionQA Medical Interface\n\n🔧 **SUCCESS:** Image transferred and loaded successfully!\n\nYou can now proceed with distortion and enhancement.`,
          timestamp: new Date().toISOString()
        };
        setChatMessages(prev => [...prev, autoLoadMessage]);
        
        return true;
      }
      
      console.log('ℹ️ BETACLARITY DEBUG: No transferred image found');
    } catch (error) {
      console.error('❌ BETACLARITY DEBUG: Error loading transferred image:', error);
    }
    return false;
  };

  // 🔧 IMMEDIATE CHECK: Run check every time component renders (not just on mount)
  React.useLayoutEffect(() => {
    console.log('🔧 BETACLARITY IMMEDIATE: useLayoutEffect triggered - checking localStorage NOW');
    checkForTransferredImage();
  }); // No dependency array = runs on every render

  // 🔧 FORCE CHECK: Additional immediate check on component mount
  React.useEffect(() => {
    console.log('🔧 BETACLARITY FORCE: Component mounted, immediate localStorage check');
    const immediate = localStorage.getItem('betasr_transfer_image');
    console.log('🔧 BETACLARITY FORCE: localStorage found:', !!immediate);
    if (immediate) {
      console.log('🔧 BETACLARITY FORCE: Calling checkForTransferredImage()');
      checkForTransferredImage();
    }
  }, []); // Runs only on mount

  // 🔧 AUTO CHECK: Periodic check for transferred images
  React.useEffect(() => {
    console.log('🔧 BETACLARITY AUTO: Setting up periodic check for transfers');
    const interval = setInterval(() => {
      const transferData = localStorage.getItem('betasr_transfer_image');
      if (transferData) {
        console.log('🔧 BETACLARITY AUTO: Transfer detected in periodic check!');
        checkForTransferredImage();
      }
    }, 2000); // Check every 2 seconds

    return () => {
      console.log('🔧 BETACLARITY AUTO: Cleaning up periodic check');
      clearInterval(interval);
    };
  }, []);

  // Check for transferred image from medical interface - Updated: 2025-01-17 21:40:00
  useEffect(() => {
    checkForTransferredImage();
  }, []);

  // Also check when window gets focus (in case BetaClarity was opened after image transfer)
  useEffect(() => {
    const handleWindowFocus = () => {
      console.log('🔧 BETACLARITY DEBUG: Window focused, checking for transferred image...');
      setTimeout(() => {
        checkForTransferredImage();
      }, 100); // Small delay to ensure localStorage is updated
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, []);

  // On modality change, fetch sample images
  useEffect(() => {
    if (selectedModality) {
      fetchSampleImages(selectedModality);
    }
  }, [selectedModality]);

  const fetchSampleImages = async (modality) => {
    try {
      const url = `${PYTHON_API_URL}/get_sample_images/${encodeURIComponent(modality)}`;
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to fetch sample images");
      setSampleImages(data.images || []);
    } catch (error) {
      console.error("Error fetching sample images:", error);
      setSampleImages([]);
    }
  };

  // Enhancement => map "level" to steps & eta
  useEffect(() => {
    const steps = 20 * enhancementLevel + 80;
    const mappedEta = 0.8 * (enhancementLevel / 100);
    setDdimSteps(steps);
    setEta(mappedEta);
  }, [enhancementLevel]);

  const handleLogout = () => {
    try {
      // Clear any app state
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      sessionStorage.clear();
      
      // Try both navigation approaches to ensure it works
      try {
        // If using React Router
        if (navigate) {
          navigate("/login");
        } else {
          // Direct redirection
          window.location.href = "/login";
        }
      } catch (e) {
        console.error("Navigation error:", e);
        // Fallback to direct redirection
        window.location.href = "/login";
      }
    } catch (err) {
      console.error("Logout error:", err);
      // Last resort - simplest redirect
      window.location.replace("/login");
    }
  };

  const resetImages = () => {
    setOriginalUrl(null);
    setDistortedUrl(null);
    setDenoisedUrl(null);
    setOriginalMetrics(null);
    setDistortedMetrics(null);
    setDenoisedMetrics(null);
  };

  // Upload file
  const handleChooseFileClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    resetImages();
    setProcessing(true);
    setProgressMessage("UPLOADING...");
    setProgress(10);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("session_id", sessionId);

      const resp = await fetch(`${PYTHON_API_URL}/upload_file`, {
        method: "POST",
        body: formData
      });
      if (!resp.ok) {
        const errData = await resp.json();
        throw new Error(`Upload failed: ${errData.error || "Unknown error"}`);
      }

      setProgressMessage("LOADING ORIGINAL...");
      setProgress(50);

      const orig = `${PYTHON_API_URL}/get_preprocessed/${sessionId}?t=${Date.now()}`;
      setOriginalUrl(orig);
      await computeMetrics("preprocessed", setOriginalMetrics);

      setProgressMessage("DONE");
      setProgress(100);
    } catch (error) {
      console.error("Upload error:", error);
      setProgressMessage(`ERROR: ${error.message}`);
      setProgress(0);
    } finally {
      setTimeout(() => {
        setProcessing(false);
        setProgressMessage("IDLE");
        setProgress(0);
      }, 1200);
    }
  };

  // Load sample image
  const handleSampleImageClick = async (imgId) => {
    try {
      setLoadingImageId(imgId);
      resetImages();
      setProcessing(true);
      setProgressMessage("LOADING SAMPLE");
      setProgress(25);

      const resp = await fetch(`${PYTHON_API_URL}/load_sample_image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          modality: selectedModality,
          image_id: imgId
        })
      });
      if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || "Unknown error");
      }

      setProgress(50);
      await new Promise((r) => setTimeout(r, 500));

      const pre = `${PYTHON_API_URL}/get_preprocessed/${sessionId}?t=${Date.now()}`;
      setOriginalUrl(pre);
      await computeMetrics("preprocessed", setOriginalMetrics);

      setProgress(100);
      setProgressMessage("SAMPLE LOADED");
    } catch (error) {
      console.error("Error loading sample image:", error);
      setProgressMessage("ERROR: " + error.message);
      setProgress(0);
    } finally {
      setLoadingImageId(null);
      setTimeout(() => {
        setProcessing(false);
        setProgressMessage("IDLE");
        setProgress(0);
      }, 1200);
    }
  };

  // Apply distortion
  const handleApplyDistortion = async () => {
    if (!originalUrl) {
      alert("No original loaded yet!");
      return;
    }
    setProcessing(true);
    setProgressMessage("APPLYING DISTORTION...");
    setProgress(10);

    try {
      const body = {
        session_id: sessionId,
        distortion_type: distortionType,
        distortion_level: distortionLevel,
        scale_factor: scaleFactor
      };
      const resp = await fetch(`${PYTHON_API_URL}/process_distortion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!resp.ok) {
        const errData = await resp.json();
        throw new Error(errData.error || "Distortion error");
      }

      setProgressMessage("DISTORTION APPLIED");
      setProgress(50);

      const dist = `${PYTHON_API_URL}/get_distorted/${sessionId}?t=${Date.now()}`;
      setDistortedUrl(dist);
      await computeMetrics("distorted", setDistortedMetrics);

      setProgressMessage("DONE");
      setProgress(100);
    } catch (err) {
      console.error("Distortion error:", err);
      setProgressMessage("DISTORTION FAILED");
      setProgress(0);
    }

    setTimeout(() => {
      setProcessing(false);
      setProgressMessage("IDLE");
      setProgress(0);
    }, 1200);
  };

  // Enhancement
  const handlePerformInference = async () => {
    if (!distortedUrl) {
      alert("No distorted image available!");
      return;
    }
    if (selectedModel !== "betasr") {
      alert("Please select BetaSR v1 for enhancement!");
      return;
    }

    setProcessing(true);
    setIsInferencing(true);
    setProgressMessage("INITIALIZING...");
    setProgress(0);

    try {
      const body = {
        session_id: sessionId,
        ddim_steps: parseInt(ddimSteps),
        eta: parseFloat(eta)
      };

      const response = await fetch(`${PYTHON_API_URL}/apply_denoising`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let denoisingComplete = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              if (data.step !== undefined) {
                const percentage = (data.step / parseInt(ddimSteps)) * 100;
                setProgress(percentage);
                setProgressMessage("ENHANCING");
              }
              if (data.completed) {
                denoisingComplete = true;
              }
            } catch (e) {
              console.warn("Error parsing line:", e);
            }
          }
        }
      }

      if (denoisingComplete) {
        setProgressMessage("LOADING RESULT...");
        setProgress(90);

        const denoised = `${PYTHON_API_URL}/get_denoised/${sessionId}?t=${Date.now()}`;
        const imageResponse = await fetch(denoised);
        if (!imageResponse.ok) {
          throw new Error("Failed to load enhanced image");
        }
        setDenoisedUrl(denoised);
        await computeMetrics("denoised", setDenoisedMetrics);

        // Transfer enhanced image back to medical interface
        try {
          console.log('🔧 BETACLARITY DEBUG: Preparing to transfer enhanced image back to medical interface...');
          
          // Fetch the enhanced image and convert to base64
          const enhancedImageResponse = await fetch(denoised);
          if (enhancedImageResponse.ok) {
            const blob = await enhancedImageResponse.blob();
            const reader = new FileReader();
            
            reader.onload = function(e) {
              const enhancedImageData = e.target.result;
              
              // Get original image name from localStorage transfer data (if available)
              let originalName = 'enhanced-image.png';
              try {
                const transferHistory = localStorage.getItem('betasr_transfer_image');
                if (transferHistory) {
                  const historyData = JSON.parse(transferHistory);
                  originalName = historyData.imageName.replace(/\.(png|jpg|jpeg)$/i, '-enhanced.$1');
                }
              } catch (e) {
                console.warn('Could not get original filename for enhanced image');
              }
              
              // Prepare enhanced image transfer data
              const enhancedTransferData = {
                imageData: enhancedImageData,
                imageName: originalName,
                imageSize: blob.size,
                imageType: blob.type,
                transferTime: Date.now(),
                sourceInterface: 'betaclarity-enhanced',
                isEnhanced: true,
                enhancementCompleted: true
              };
              
              // Store enhanced image for medical interface
              localStorage.setItem('betasr_enhanced_return', JSON.stringify(enhancedTransferData));
              console.log('✅ BETACLARITY DEBUG: Enhanced image stored for return transfer:', {
                name: originalName,
                size: blob.size,
                dataLength: enhancedImageData.length
              });
              
              // Add chat message about successful transfer
              const transferMessage = {
                id: Date.now() + 1,
                role: 'assistant',
                content: `🔄 **Enhanced image prepared for transfer back to Medical Interface**\n\n**File:** ${originalName}\n**Size:** ${(blob.size / 1024).toFixed(1)} KB\n**Status:** Ready for automatic return\n\n💡 The enhanced image will be automatically loaded in the Medical Interface when you return to it.`,
                timestamp: new Date().toISOString()
              };
              setChatMessages(prev => [...prev, transferMessage]);
            };
            
            reader.readAsDataURL(blob);
          }
        } catch (error) {
          console.error('❌ BETACLARITY DEBUG: Error preparing enhanced image transfer:', error);
        }

        setProgressMessage("DONE");
        setProgress(100);
      } else {
        setProgressMessage("ERROR: No completion signal");
        setProgress(0);
      }
    } catch (err) {
      console.error("Enhancement error:", err);
      setProgressMessage(`ERROR: ${err.message}`);
      setProgress(0);
    } finally {
      setIsInferencing(false);
      setTimeout(() => {
        setProcessing(false);
        setProgressMessage("IDLE");
        setProgress(0);
      }, 1500);
    }
  };

  // Compute metrics
  const computeMetrics = async (stage, setMetrics) => {
    console.log(`Computing metrics for stage: ${stage}`);
    try {
      const response = await fetch(`${PYTHON_API_URL}/compute_metrics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          stage: stage
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log(`Metrics received:`, data);
      
      if (data.psnr !== undefined && data.ssim !== undefined) {
        setMetrics({
          psnr: data.psnr,
          ssim: data.ssim
        });
      } else {
        console.error('Invalid metrics data received:', data);
      }
    } catch (error) {
      console.error('Error computing metrics:', error);
    }
  };

  // Download
  const handleDownloadReport = () => {
    alert("Placeholder for PDF report generation.");
  };
  const handleDownloadDenoised = () => {
    if (!denoisedUrl) {
      alert("No denoised image available!");
      return;
    }
    const link = document.createElement("a");
    link.href = denoisedUrl;
    link.download = `denoised_${sessionId}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Transfer enhanced image back to medical interface
  const handleTransferBack = async () => {
    if (!denoisedUrl) {
      alert("No enhanced image available! Apply enhancement first.");
      return;
    }

    try {
      console.log('🔧 BETASR DEBUG: Starting transfer back to medical interface...');
      
      // Fetch the enhanced image and convert to base64
      const response = await fetch(denoisedUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch enhanced image');
      }
      
      const blob = await response.blob();
      const reader = new FileReader();
      
      reader.onload = function(e) {
        const enhancedImageData = e.target.result;
        
        // Get original image name (if available from previous transfer)
        let originalName = 'enhanced-image.png';
        try {
          if (window.lastProcessedImageName) {
            originalName = window.lastProcessedImageName.replace(/\.(png|jpg|jpeg)$/i, '-enhanced.$1');
          }
        } catch (error) {
          console.warn('Could not get original filename for enhanced image');
        }
        
        // Create enhanced transfer data
        const enhancedTransferData = {
          imageData: enhancedImageData,
          imageName: originalName,
          imageSize: blob.size,
          imageType: blob.type,
          transferTime: Date.now(),
          sourceInterface: 'betasr-enhanced',
          isEnhanced: true,
          enhancementCompleted: true
        };
        
        // Store enhanced image for medical interface (localStorage AND PostMessage)
        localStorage.setItem('betasr_enhanced_return', JSON.stringify(enhancedTransferData));
        console.log('✅ BETASR DEBUG: Enhanced image stored in localStorage');
        
        // Try PostMessage to medical interface directly
        try {
          const medicalOrigin = 'http://localhost:8080';
          // Send message to parent window (if opened from medical interface)
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({
              type: 'BETASR_ENHANCED_RETURN',
              data: enhancedTransferData
            }, medicalOrigin);
            console.log('✅ BETASR DEBUG: Enhanced image sent via PostMessage to opener');
          }
          
          // Also try to send to all other windows
          if (window.parent !== window) {
            window.parent.postMessage({
              type: 'BETASR_ENHANCED_RETURN', 
              data: enhancedTransferData
            }, medicalOrigin);
            console.log('✅ BETASR DEBUG: Enhanced image sent via PostMessage to parent');
          }
        } catch (postError) {
          console.warn('⚠️ PostMessage failed, relying on localStorage:', postError);
        }
        
        console.log('✅ BETASR DEBUG: Enhanced image transfer completed:', {
          name: originalName,
          size: blob.size,
          dataLength: enhancedImageData.length,
          transferTime: enhancedTransferData.transferTime
        });
        
        // Add success message to chat
        const transferMessage = {
          id: Date.now(),
          role: 'assistant',
          content: `✅ **Enhanced image ready for Medical Interface!**\n\n**File:** ${originalName}\n**Size:** ${(blob.size / 1024).toFixed(1)} KB\n**Status:** Transfer completed\n\n💡 **Return to Medical Interface** to see the enhanced result (it will load automatically).`,
          timestamp: new Date().toISOString()
        };
        setChatMessages(prev => [...prev, transferMessage]);
        
        // Show success message in chat (no popup)
        const successMessage = {
          text: "✅ Enhanced image returned to Medical Interface! Switch back to see the result.",
          sender: 'assistant',
          timestamp: new Date().toISOString()
        };
        setChatMessages(prev => [...prev, successMessage]);
      };
      
      reader.readAsDataURL(blob);
      
    } catch (error) {
      console.error('❌ BETASR DEBUG: Error transferring enhanced image:', error);
      alert(`❌ Error transferring enhanced image: ${error.message}`);
    }
  };

  // Prepare data for the PSNR/SSIM panel
  const psnrSets = [];
  if (showMetrics && originalMetrics) {
    psnrSets.push({
      label: "Original",
      metrics: originalMetrics
    });
  }
  if (showMetrics && distortedMetrics) {
    psnrSets.push({
      label: "Distorted",
      metrics: distortedMetrics
    });
  }
  if (showMetrics && denoisedMetrics) {
    psnrSets.push({
      label: "Enhanced",
      metrics: denoisedMetrics
    });
  }

  const styles = {
    container: {
      fontFamily:
        'Inter, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
      backgroundColor: "#000",
      color: "#fff",
      width: "100%",
      height: "100vh",
      margin: 0,
      padding: 0,
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column"
    },
    header: {
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 16px",
      borderBottom: "1px solid #333",
      height: "60px"
    },
    brandGroup: {
      display: "flex",
      alignItems: "center",
      gap: "12px"
    },
    mainLayout: {
      flexGrow: 1,
      display: "grid",
      gridTemplateColumns: "260px 1fr",
      gap: "16px",
      overflow: "hidden"
    },
    leftPanel: {
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      overflowY: "auto",
      padding: "8px"
    },
    panel: {
      backgroundColor: "#111",
      borderRadius: "8px",
      padding: "10px"
    },
    panelHeading: {
      fontSize: "1rem",
      fontWeight: 600,
      marginBottom: "6px"
    },
    rightGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: "16px",
      overflow: "auto",
      padding: "8px"
    },
    square: {
      backgroundColor: "#111",
      borderRadius: "8px",
      display: "flex",
      flexDirection: "column",
      padding: "10px",
      minHeight: "200px",
      overflow: "hidden"
    },
    imageContainer: {
      flex: 1,
      backgroundColor: "#222",
      borderRadius: "6px",
      marginTop: "6px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      overflow: "hidden"
    },
    footer: {
      flexShrink: 0,
      backgroundColor: "#111",
      borderTop: "1px solid #333",
      padding: "10px 0",
      textAlign: "center",
      fontStyle: "italic",
      color: "#aaa",
      fontSize: "0.85rem"
    }
  };

  const [measureMode, setMeasureMode] = useState(false);

  const generateReport = async (type) => {
    setProcessing(true);
    setProgressMessage("Generating AI Report");
    
    try {
      // Qui andrà la logica di generazione del report
      const reportData = {
        clinical: {
          title: "Clinical Analysis Report",
          sections: ["Patient Data", "Image Analysis", "Findings", "Recommendations"]
        },
        research: {
          title: "Research Analysis Report",
          sections: ["Methodology", "Data Analysis", "Statistical Significance", "Research Implications"]
        },
        investor: {
          title: "Investor Pitch Report",
          sections: ["Market Impact", "Technology Overview", "ROI Analysis", "Growth Potential"]
        }
      }[type];

      // Simula il processo di generazione
      for(let i = 0; i <= 100; i += 20) {
        setProgress(i);
        await new Promise(r => setTimeout(r, 500));
      }

      // Qui andrà l'apertura del report generato
      console.log(`Generated ${type} report:`, reportData);
      
    } catch (error) {
      console.error("Error generating report:", error);
    } finally {
      setProcessing(false);
      setProgress(0);
      setProgressMessage("IDLE");
    }
  };

  // Aggiungi queste funzioni di utilità
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const reportGenerationSteps = {
    clinical: [
      { message: "Analyzing medical image parameters...", progress: 20 },
      { message: "Detecting anatomical structures...", progress: 40 },
      { message: "Evaluating pathological findings...", progress: 60 },
      { message: "Comparing with clinical database...", progress: 80 },
      { message: "Generating clinical recommendations...", progress: 90 },
      { message: "Finalizing medical report...", progress: 100 }
    ],
    research: [
      { message: "Processing image metadata...", progress: 20 },
      { message: "Running statistical analysis...", progress: 40 },
      { message: "Comparing with research datasets...", progress: 60 },
      { message: "Generating research metrics...", progress: 80 },
      { message: "Compiling research findings...", progress: 90 },
      { message: "Finalizing research report...", progress: 100 }
    ],
    investor: [
      { message: "Analyzing market relevance...", progress: 20 },
      { message: "Calculating potential impact...", progress: 40 },
      { message: "Evaluating competitive advantage...", progress: 60 },
      { message: "Generating ROI projections...", progress: 80 },
      { message: "Compiling market insights...", progress: 90 },
      { message: "Finalizing investor report...", progress: 100 }
    ]
  };

  // Aggiorna la funzione handleReportGeneration
  const handleReportGeneration = async (type) => {
    setReportType(type);
    setReportModalVisible(false);
    setProcessing(true);

    try {
      for (const step of reportGenerationSteps[type]) {
        setProgressMessage(step.message);
        setProgress(step.progress);
        await sleep(800);
      }
      
      setAIReportVisible(true); // Mostra la finestra del report

    } catch (error) {
      console.error("Error generating report:", error);
      setProgressMessage("Error generating report");
    } finally {
      setProcessing(false);
      setProgress(0);
      setProgressMessage("IDLE");
    }
  };

  // Funzione per generare il contenuto del report
  const generateReportContent = async (type) => {
    const currentDate = new Date().toLocaleDateString();
    const reportTemplates = {
      clinical: {
        title: "Clinical Analysis Report",
        sections: [
          {
            title: "Patient Information",
            content: "Anonymous Patient ID: BV-2024-001\nDate of Analysis: " + currentDate
          },
          {
            title: "Image Analysis",
            content: "Modality: MRI\nImage Quality: Enhanced with BetaVision AI\nPSNR: 32.4 dB\nSSIM: 0.945"
          },
          {
            title: "AI Findings",
            content: "- Region of Interest identified\n- Tissue contrast improved by 47%\n- No significant artifacts detected"
          },
          {
            title: "Clinical Recommendations",
            content: "1. Further analysis recommended for ROI-1\n2. Image quality suitable for diagnostic use\n3. Enhancement parameters optimal for current modality"
          }
        ]
      },
      research: {
        title: "Research Analysis Report",
        sections: [
          {
            title: "Study Parameters",
            content: "Study ID: BV-RES-2024-001\nDate: " + currentDate + "\nModality: MRI"
          },
          {
            title: "Technical Analysis",
            content: "- Enhancement Algorithm: BetaVision v2.0\n- Processing Time: 1.2s\n- Memory Usage: 1.4GB"
          },
          {
            title: "Statistical Metrics",
            content: "PSNR: 32.4 dB\nSSIM: 0.945\nMSE: 0.0023\nMAE: 0.0018"
          },
          {
            title: "Research Implications",
            content: "The enhancement shows statistically significant improvement in image quality, particularly in low-contrast regions."
          }
        ]
      },
      investor: {
        title: "Investor Analysis Report",
        sections: [
          {
            title: "Market Overview",
            content: "Date: " + currentDate + "\nSector: Medical Imaging AI\nMarket Size: $4.2B"
          },
          {
            title: "Technology Performance",
            content: "- Processing Speed: 5x faster than industry standard\n- Quality Improvement: 47% better than baseline\n- Cost Reduction: 60% per analysis"
          },
          {
            title: "Competitive Analysis",
            content: "BetaVision leads in:\n1. Processing Speed\n2. Image Quality\n3. Cost Efficiency"
          },
          {
            title: "Growth Potential",
            content: "Projected market penetration: 15% by 2025\nEstimated ROI: 320% over 3 years"
          }
        ]
      }
    };

    await sleep(500); // Simula il tempo di generazione
    return reportTemplates[type];
  };

  // Funzione per mostrare il report generato
  const showGeneratedReport = (reportContent) => {
    // Qui puoi implementare la logica per mostrare il report
    // Per ora, lo logghiamo solo in console
    console.log("Generated Report:", reportContent);
    
    // TODO: Implementare un modale o una nuova vista per mostrare il report
    alert(`${reportContent.title} generated successfully! Check the console for details.`);
  };

  // Aggiungi il componente modale
  const ReportModal = () => (
    <div style={{
      display: reportModalVisible ? 'flex' : 'none',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      zIndex: 1000,
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <div style={{
        background: '#1a1a1a',
        borderRadius: '12px',
        padding: '20px',
        width: '90%',
        maxWidth: '500px',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{
          display: 'grid',
          gap: '15px',
          gridTemplateColumns: '1fr 1fr'
        }}>
          {[
            {
              type: 'clinical',
              title: 'Clinical',
              icon: 'M22 12h-4l-3 9L9 3l-3 9H2',
              color: '#3b82f6',
              description: 'Diagnostic report for clinical use'
            },
            {
              type: 'research',
              title: 'Research',
              icon: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z',
              color: '#10b981',
              description: 'Detailed analysis for research purposes'
            }
          ].map(report => (
            <button
              key={report.type}
              onClick={() => handleReportGeneration(report.type)}
              style={{
                background: `rgba(${report.color}, 0.1)`,
                border: `1px solid rgba(${report.color}, 0.2)`,
                borderRadius: '8px',
                padding: '20px',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={report.color} strokeWidth="2">
                <path d={report.icon}/>
              </svg>
              {report.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // Modifica la finestra del report per includere l'immagine e un layout più medicale
  const AIReportWindow = ({ visible, onClose, reportType, imageUrl }) => {
    if (!visible) return null;

    return (
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '90%',
        maxWidth: '900px',
        maxHeight: '85vh',
        background: '#1a1a1a',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        zIndex: 1000,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          padding: '20px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '20px',
          overflowY: 'auto'
        }}>
          {/* Colonna sinistra - Immagine e metriche tecniche */}
          <div>
            <div style={{
              background: '#000',
              borderRadius: '8px',
              padding: '10px',
              marginBottom: '20px'
            }}>
              <img 
                src={imageUrl} 
                alt="Enhanced medical image"
                style={{
                  width: '100%',
                  borderRadius: '4px'
                }}
              />
            </div>
            
            <div style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '8px',
              padding: '15px'
            }}>
              <h4 style={{color: '#fff', marginTop: 0}}>Technical Metrics</h4>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
                color: '#aaa',
                fontSize: '0.9rem'
              }}>
                <div>PSNR: 32.4 dB</div>
                <div>SSIM: 0.945</div>
                <div>MSE: 0.0023</div>
                <div>Processing: 1.2s</div>
              </div>
            </div>
          </div>

          {/* Colonna destra - Report dettagliato */}
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '8px',
            padding: '20px',
            color: '#fff'
          }}>
            <h2 style={{
              margin: '0 0 20px 0',
              color: '#fff',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              paddingBottom: '10px'
            }}>
              Radiology Report
            </h2>

            <div style={{fontSize: '0.9rem', lineHeight: '1.6'}}>
              <div style={{marginBottom: '20px'}}>
                <strong>Date:</strong> {new Date().toLocaleDateString()}<br/>
                <strong>Time:</strong> {new Date().toLocaleTimeString()}<br/>
                <strong>Study ID:</strong> BV-{Math.random().toString(36).substr(2, 9).toUpperCase()}
              </div>

              <h4 style={{color: '#3b82f6', marginBottom: '10px'}}>Image Analysis</h4>
              <ul style={{
                listStyle: 'none',
                padding: 0,
                margin: '0 0 20px 0'
              }}>
                <li>• Modality: MRI</li>
                <li>• Sequence: T2-weighted</li>
                <li>• Enhancement: BetaVision AI Enhanced</li>
              </ul>

              <h4 style={{color: '#3b82f6', marginBottom: '10px'}}>Key Findings</h4>
              <ul style={{
                listStyle: 'none',
                padding: 0,
                margin: '0 0 20px 0'
              }}>
                <li>• Image Quality: Significantly improved post-enhancement</li>
                <li>• Contrast: Enhanced by 45% in ROI</li>
                <li>• Artifacts: No significant artifacts detected</li>
              </ul>

              <h4 style={{color: '#3b82f6', marginBottom: '10px'}}>AI Recommendations</h4>
              <ul style={{
                listStyle: 'none',
                padding: 0,
                margin: 0
              }}>
                <li>• Optimal for diagnostic interpretation</li>
                <li>• Suitable for clinical analysis</li>
                <li>• Recommended for detailed examination</li>
              </ul>
            </div>
          </div>
        </div>

        <div style={{
          padding: '15px 20px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          background: 'rgba(0,0,0,0.2)'
        }}>
          <button
            onClick={() => {
              setChatVisible(true);
              setInitialPrompt(formatReportForChat()); // Aggiungi questo stato se non esiste
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#147ce5',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 16px',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            </svg>
            Pass Report to Chat
          </button>
        </div>
      </div>
    );
  };

  // Funzione per formattare il report come prompt per la chat
  const formatReportForChat = () => {
    return `Please analyze this radiology report:

Image Analysis:
- Modality: MRI
- Sequence: T2-weighted
- Enhancement: BetaVision AI Enhanced

Key Findings:
- Image Quality: Significantly improved post-enhancement
- Contrast: Enhanced by 45% in ROI
- Artifacts: No significant artifacts detected

Technical Metrics:
- PSNR: 32.4 dB
- SSIM: 0.945
- Processing Time: 1.2s

Can you provide additional insights or answer any specific questions about these findings?`;
  };

  // Mantieni solo il componente BetaVision Chat
  const BetaVisionChat = ({ visible, onClose, initialPrompt }) => {
    if (!visible) return null;

    return (
      <div style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '400px',
        height: '600px',
        background: '#1a1a1a',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '15px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(0,0,0,0.2)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            </svg>
            <span style={{color: '#fff', fontWeight: '500'}}>BetaVision Chat</span>
            <span style={{
              fontSize: '0.7rem',
              padding: '2px 6px',
              background: 'rgba(59,130,246,0.2)',
              borderRadius: '10px',
              color: '#3b82f6'
            }}>AI</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#666',
              cursor: 'pointer',
              padding: '5px'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Chat content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          {/* System message */}
          <div style={{
            background: 'rgba(59,130,246,0.1)',
            padding: '12px',
            borderRadius: '8px',
            fontSize: '0.9rem',
            color: '#fff'
          }}>
            Hello! I'm your BetaVision AI assistant. I'm analyzing the report you've shared.
          </div>

          {/* Initial prompt message */}
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            padding: '12px',
            borderRadius: '8px',
            fontSize: '0.9rem',
            color: '#fff',
            whiteSpace: 'pre-wrap'
          }}>
            {initialPrompt}
          </div>

          {/* AI response */}
          <div style={{
            background: 'rgba(59,130,246,0.1)',
            padding: '12px',
            borderRadius: '8px',
            fontSize: '0.9rem',
            color: '#fff'
          }}>
            I've analyzed the report. The image quality shows significant improvement after enhancement, with a 45% contrast enhancement in the ROI. The technical metrics (PSNR: 32.4 dB, SSIM: 0.945) indicate excellent image quality. Would you like me to elaborate on any specific aspect of the findings?
          </div>
        </div>

        {/* Input area */}
        <div style={{
          padding: '15px 20px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(0,0,0,0.2)'
        }}>
          <div style={{
            display: 'flex',
            gap: '10px'
          }}>
            <input
              type="text"
              placeholder="Ask about the report..."
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                padding: '10px',
                color: '#fff',
                fontSize: '0.9rem'
              }}
            />
            <button style={{
              background: '#3b82f6',
              border: 'none',
              borderRadius: '6px',
              padding: '0 15px',
              color: '#fff',
              cursor: 'pointer'
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Stili per i selettori range (senza selettori webkit che non funzionano inline)
  const rangeInputStyle = {
    WebkitAppearance: 'none',
    appearance: 'none',
    width: '100%',
    height: '4px',
    borderRadius: '2px',
    background: 'rgba(255, 255, 255, 0.1)',
    outline: 'none',
    opacity: '0.7',
    transition: 'opacity .2s',
    margin: '10px 0',
    cursor: 'pointer'
  };

  // Componente per il selettore dei modelli
  const ModelSelector = ({ onClose }) => {
    return (
      <div style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        background: '#1a1a1a',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.1)',
        padding: '16px',
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
      }}>
        {/* BetaSR Selection */}
        <div style={{
          marginBottom: '20px'
        }}>
          <h3 style={{
            color: '#fff',
            fontSize: '0.9rem',
            marginBottom: '12px'
          }}>
            BetaSR (Enhancement)
          </h3>
          <select style={{
            width: '100%',
            padding: '8px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '4px',
            color: '#fff'
          }}>
            <option value="v1">BetaSR v1</option>
            <option value="v2" disabled>BetaSR v2 (Coming Soon)</option>
          </select>
        </div>

        {/* BetaVision Selection */}
        <div style={{
          marginBottom: '20px'
        }}>
          <h3 style={{
            color: '#fff',
            fontSize: '0.9rem',
            marginBottom: '12px'
          }}>
            BetaVision (Analysis)
          </h3>
          <select style={{
            width: '100%',
            padding: '8px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '4px',
            color: '#fff'
          }}>
            <option value="v1">BetaVision v1</option>
            <option value="v2" disabled>BetaVision v2 (Coming Soon)</option>
          </select>
        </div>

        <div style={{
          marginTop: '16px',
          padding: '12px',
          borderRadius: '4px',
          background: 'rgba(59,130,246,0.1)',
          fontSize: '0.8rem',
          color: '#3b82f6'
        }}>
          <strong>Currently Active:</strong> BetaSR v1 + BetaVision v1
        </div>
      </div>
    );
  };

  // ── Compute / Runtime helpers ───────────────────────────────────────
  const ACCENT = {
    cpu:      "#9ca3af",
    cuda:     "#76b900",  // NVIDIA green
    nvidia:   "#76b900",
    apple:    "#a855f7",
    npu:      "#a855f7",
    coreml:   "#a855f7",
    mps:      "#a855f7",
    directml: "#0078d4",
  };
  const accentForDevice = (d) => {
    if (!d) return ACCENT.cpu;
    if (d.kind === "cpu") return ACCENT.cpu;
    if (d.vendor === "NVIDIA") return ACCENT.nvidia;
    if (d.vendor === "Apple") return ACCENT.apple;
    if (d.vendor === "Microsoft") return ACCENT.directml;
    return ACCENT.cpu;
  };

  // ── Hardware Status (compact, no emoji) ─────────────────────────────
  const HardwareStatusBar = () => {
    if (!systemInfo) return null;
    const { device, model: mdl, runtime } = systemInfo;
    const accel = device.acceleration && device.acceleration !== "none" ? device.acceleration.toUpperCase() : "CPU";
    const accelColor = device.acceleration === "cuda" ? ACCENT.nvidia
                     : device.acceleration?.includes("coreml") || device.acceleration === "mps" ? ACCENT.apple
                     : device.acceleration?.includes("directml") ? ACCENT.directml
                     : ACCENT.cpu;
    const chip = device.name || "Unknown";
    const fmt = mdl.format || "PyTorch FP32";
    const isQuantized = mdl.quantized;
    const precision = mdl.precision || "FP32";

    const row = (label, value, valueColor) => (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
        <span style={{ color: "#7a7a7a", fontSize: "0.7rem", letterSpacing: "0.02em" }}>{label}</span>
        <span style={{ color: valueColor || "#e5e7eb", fontSize: "0.72rem", fontWeight: 500, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{value}</span>
      </div>
    );

    return (
      <div style={{
        background: "rgba(0,0,0,0.4)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
        padding: "10px 12px",
        marginTop: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            color: accelColor, fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.06em",
          }}>
            <span style={{
              display: "inline-block", width: 6, height: 6,
              borderRadius: "50%", background: accelColor,
              boxShadow: `0 0 8px ${accelColor}`,
              animation: "hw-pulse 2s infinite",
            }} />
            {accel}
          </span>
          <span style={{ color: "#666", fontSize: "0.65rem", letterSpacing: "0.05em" }}>
            {device.kind?.toUpperCase() || "DEVICE"}
          </span>
        </div>

        {row("Chip", chip.length > 30 ? chip.slice(0, 28) + "…" : chip, "#d1d5db")}
        {device.details?.vram_total_gb && row("VRAM", `${device.details.vram_used_gb} / ${device.details.vram_total_gb} GB`, "#60a5fa")}
        {device.details?.cuda_version && row("CUDA", device.details.cuda_version, "#60a5fa")}
        {device.details?.compute_capability && row("Compute", device.details.compute_capability, "#9ca3af")}

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", margin: "7px 0" }} />

        {row("Backend", fmt, isQuantized ? "#34d399" : "#e5e7eb")}
        {row("Precision", precision, precision === "INT8" ? "#34d399" : "#9ca3af")}
        {row("Quantized", isQuantized ? "Yes" : "No", isQuantized ? "#34d399" : "#9ca3af")}
        {mdl.size_mb && row("Model size", `${mdl.size_mb} MB`, "#9ca3af")}

        {runtime.ort_providers && runtime.ort_providers.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ color: "#7a7a7a", fontSize: "0.68rem", marginBottom: 4, letterSpacing: "0.04em" }}>ONNX EP</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {runtime.ort_providers
                .filter(p => p !== "CPUExecutionProvider")
                .slice(0, 3)
                .map(p => (
                  <span key={p} style={{
                    fontSize: "0.6rem", padding: "1px 6px",
                    borderRadius: 3,
                    background: "rgba(255,255,255,0.04)",
                    color: "#9ca3af",
                    border: "1px solid rgba(255,255,255,0.07)",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  }}>
                    {p.replace("ExecutionProvider", "").replace("Execution", "").trim()}
                  </span>
                ))}
            </div>
          </div>
        )}

        <style>{`@keyframes hw-pulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }`}</style>
      </div>
    );
  };

  // ── Hardware Selector (CPU / GPU / NPU radio) ───────────────────────
  const HardwareSelector = () => {
    if (!devicesInfo) return null;
    const { devices, active_device, models, active_model } = devicesInfo;

    const tile = (d) => {
      const active = d.id === active_device;
      const color = accentForDevice(d);
      return (
        <button
          key={d.id}
          disabled={!d.available}
          onClick={() => handleSelectDevice(d.id)}
          title={d.reason || d.label}
          style={{
            textAlign: "left",
            background: active ? `${color}15` : "rgba(255,255,255,0.025)",
            border: `1px solid ${active ? color : "rgba(255,255,255,0.06)"}`,
            borderRadius: 7,
            padding: "8px 10px",
            cursor: d.available ? "pointer" : "not-allowed",
            opacity: d.available ? 1 : 0.4,
            transition: "all 0.15s ease",
            outline: "none",
            color: "#e5e7eb",
            fontFamily: "inherit",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
            <span style={{
              fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.08em",
              color: color, textTransform: "uppercase",
            }}>
              {d.kind} · {d.vendor}
            </span>
            {active && (
              <span style={{
                fontSize: "0.58rem", color: color, fontWeight: 600, letterSpacing: "0.05em",
              }}>ACTIVE</span>
            )}
          </div>
          <div style={{
            fontSize: "0.74rem", color: "#d1d5db", marginTop: 3,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {d.label}
          </div>
          {d.details?.vram_total_gb && (
            <div style={{ fontSize: "0.62rem", color: "#888", marginTop: 1, fontFamily: "ui-monospace, monospace" }}>
              {d.details.vram_total_gb} GB · CC {d.details.compute_capability}
            </div>
          )}
          {d.kind === "cpu" && d.details?.threads && (
            <div style={{ fontSize: "0.62rem", color: "#888", marginTop: 1, fontFamily: "ui-monospace, monospace" }}>
              {d.details.cores} cores · {d.details.threads} threads
            </div>
          )}
          {!d.available && d.reason && (
            <div style={{ fontSize: "0.6rem", color: "#a16207", marginTop: 3, lineHeight: 1.3 }}>
              {d.reason}
            </div>
          )}
        </button>
      );
    };

    const modelTile = (m) => {
      const active = m.id === active_model;
      const color = m.id === "onnx_int8" ? "#34d399" : "#60a5fa";
      return (
        <button
          key={m.id}
          disabled={!m.available}
          onClick={() => handleSelectModel(m.id)}
          title={m.reason || m.label}
          style={{
            flex: 1,
            background: active ? `${color}15` : "rgba(255,255,255,0.025)",
            border: `1px solid ${active ? color : "rgba(255,255,255,0.06)"}`,
            borderRadius: 7,
            padding: "7px 8px",
            cursor: m.available ? "pointer" : "not-allowed",
            opacity: m.available ? 1 : 0.45,
            color: "#e5e7eb",
            fontFamily: "inherit",
            textAlign: "left",
          }}
        >
          <div style={{ fontSize: "0.6rem", color, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {active ? "ACTIVE" : (m.available ? "AVAILABLE" : "DISABLED")}
          </div>
          <div style={{ fontSize: "0.72rem", color: "#e5e7eb", marginTop: 3, fontWeight: 600 }}>
            {m.label}
          </div>
          <div style={{ fontSize: "0.6rem", color: "#888", marginTop: 1, fontFamily: "ui-monospace, monospace" }}>
            {m.size_mb ? `${m.size_mb} MB` : "—"} · {m.hf_repo}
          </div>
        </button>
      );
    };

    return (
      <div style={{
        background: "rgba(0,0,0,0.4)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
        padding: "10px 12px",
        marginTop: 8,
      }}>
        <div style={{
          color: "#9ca3af", fontSize: "0.62rem", fontWeight: 700,
          letterSpacing: "0.12em", marginBottom: 8, textTransform: "uppercase",
        }}>
          Compute Device
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 5 }}>
          {devices.map(tile)}
        </div>

        <div style={{
          color: "#9ca3af", fontSize: "0.62rem", fontWeight: 700,
          letterSpacing: "0.12em", marginTop: 11, marginBottom: 6, textTransform: "uppercase",
        }}>
          Model Variant
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {models.map(modelTile)}
        </div>
      </div>
    );
  };

  // ── Live Activity Monitor (during inference) ────────────────────────
  const ActivityMonitor = () => {
    if (!isInferencing && !activityStats?.session) return null;
    const samples = activityStats?.samples || [];
    const session = activityStats?.session;
    const last = samples.length ? samples[samples.length - 1] : {};
    const accent = systemInfo?.device?.acceleration === "cuda" ? ACCENT.nvidia
                 : systemInfo?.device?.acceleration?.includes("coreml") || systemInfo?.device?.acceleration === "mps" ? ACCENT.apple
                 : ACCENT.cpu;

    const cpu = last.cpu_percent ?? 0;
    const gpu = last.gpu_percent;
    const ramUsed = last.ram_used_gb;
    const ramTot = last.ram_total_gb;
    const gpuMemUsed = last.gpu_mem_used_gb;
    const gpuMemTot = last.gpu_mem_total_gb;
    const gpuTemp = last.gpu_temp_c;

    // Build a sparkline path from samples (cpu or gpu)
    const series = samples.map(s => (gpu !== undefined ? (s.gpu_percent ?? 0) : (s.cpu_percent ?? 0)));
    const maxV = 100;
    const W = 220, H = 36;
    const path = series.length > 1 ? series.map((v, i) => {
      const x = (i / (series.length - 1)) * W;
      const y = H - (Math.min(v, maxV) / maxV) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ") : "";

    const bar = (label, value, max, unit, color) => {
      const pct = max ? Math.min(100, (value / max) * 100) : 0;
      return (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.62rem", marginBottom: 2 }}>
            <span style={{ color: "#888", letterSpacing: "0.04em" }}>{label}</span>
            <span style={{ color: "#d1d5db", fontFamily: "ui-monospace, monospace" }}>
              {value !== undefined && value !== null ? `${value.toFixed(unit === "%" ? 0 : 2)}${unit}` : "—"}
              {max ? ` / ${max.toFixed(unit === "%" ? 0 : 1)}${unit}` : ""}
            </span>
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              width: `${pct}%`, height: "100%",
              background: color, transition: "width 0.5s ease",
              boxShadow: `0 0 6px ${color}80`,
            }} />
          </div>
        </div>
      );
    };

    return (
      <div style={{
        background: "rgba(0,0,0,0.45)",
        border: `1px solid ${accent}40`,
        borderRadius: 8,
        padding: "10px 12px",
        marginTop: 8,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{
            color: accent, fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%", background: accent,
              boxShadow: `0 0 10px ${accent}`,
              animation: "hw-pulse 0.9s infinite",
            }} />
            INFERENCE ACTIVE
          </span>
          <span style={{ color: "#888", fontSize: "0.62rem", fontFamily: "ui-monospace, monospace" }}>
            {session ? `${session.elapsed_s.toFixed(1)}s` : ""}
          </span>
        </div>

        {session && session.total_steps > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.62rem", marginBottom: 3 }}>
              <span style={{ color: "#888" }}>DDIM Step</span>
              <span style={{ color: "#d1d5db", fontFamily: "ui-monospace, monospace" }}>
                {session.step} / {session.total_steps}
              </span>
            </div>
            <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                width: `${(session.step / session.total_steps) * 100}%`,
                height: "100%", background: accent, transition: "width 0.3s ease",
              }} />
            </div>
          </div>
        )}

        {/* Sparkline */}
        {series.length > 1 && (
          <div style={{ marginBottom: 4 }}>
            <svg width={W} height={H} style={{ display: "block", width: "100%", height: H }}>
              <defs>
                <linearGradient id="actGrad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity="0.4" />
                  <stop offset="100%" stopColor={accent} stopOpacity="0" />
                </linearGradient>
              </defs>
              {path && <>
                <path d={`${path} L${W},${H} L0,${H} Z`} fill="url(#actGrad)" />
                <path d={path} stroke={accent} strokeWidth="1.5" fill="none" />
              </>}
            </svg>
          </div>
        )}

        {gpu !== undefined && bar("GPU util", gpu, 100, "%", accent)}
        {bar("CPU util", cpu, 100, "%", "#9ca3af")}
        {gpuMemUsed !== undefined && gpuMemTot && bar("VRAM", gpuMemUsed, gpuMemTot, " GB", "#60a5fa")}
        {ramUsed !== undefined && ramTot && bar("RAM", ramUsed, ramTot, " GB", "#9ca3af")}
        {gpuTemp !== undefined && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: "0.62rem" }}>
            <span style={{ color: "#888" }}>GPU temp</span>
            <span style={{ color: gpuTemp > 80 ? "#ef4444" : gpuTemp > 65 ? "#f59e0b" : "#9ca3af", fontFamily: "ui-monospace, monospace" }}>
              {gpuTemp.toFixed(0)}°C
            </span>
          </div>
        )}
      </div>
    );
  };

  // Componente per il bottone dei modelli e il dropdown
  const ModelsButton = () => {
    return (
      <div style={{ position: 'relative' }}>
        {/* Models Button */}
        <div 
          onClick={() => setIsModelsPanelOpen(!isModelsPanelOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#1a1a1a',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            padding: '8px 12px',
            color: '#fff',
            cursor: 'pointer',
            userSelect: 'none'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Models
          <svg 
            width="12" 
            height="12" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
            style={{
              transform: isModelsPanelOpen ? 'rotate(180deg)' : 'rotate(0)',
              transition: 'transform 0.2s'
            }}
          >
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>

        {/* Models Panel */}
        {isModelsPanelOpen && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            width: '240px',
            background: '#1a1a1a',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.1)',
            marginTop: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            zIndex: 1000
          }}>
            {/* BetaSR Section */}
            <div style={{ padding: '12px' }}>
              <div style={{ 
                color: '#fff', 
                fontSize: '0.9rem',
                fontWeight: 500,
                marginBottom: '8px' 
              }}>
                BetaSR (Enhancement)
              </div>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}>
                <button
                  onClick={() => setSelectedModel('betasr')}
                  style={{
                    background: selectedModel === 'betasr' ? 'rgba(20,124,229,0.2)' : 'rgba(255,255,255,0.05)',
                    border: '1px solid ' + (selectedModel === 'betasr' ? '#147ce5' : 'rgba(255,255,255,0.1)'),
                    borderRadius: '4px',
                    padding: '8px 12px',
                    color: '#fff',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  BetaSR v1
                  <span style={{ 
                    fontSize: '0.7rem',
                    padding: '2px 6px',
                    background: 'rgba(52,199,89,0.2)',
                    borderRadius: '10px',
                    color: '#34c759'
                  }}>
                    Active
                  </span>
                </button>
                <button
                  disabled
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '4px',
                    padding: '8px 12px',
                    color: '#666',
                    textAlign: 'left',
                    cursor: 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  BetaSR v2
                  <span style={{ 
                    fontSize: '0.7rem',
                    padding: '2px 6px',
                    background: 'rgba(255,149,0,0.2)',
                    borderRadius: '10px',
                    color: '#ff9500'
                  }}>
                    Coming Soon
                  </span>
                </button>
              </div>
            </div>

            {/* BetaVision Section */}
            <div style={{ 
              padding: '12px',
              borderTop: '1px solid rgba(255,255,255,0.1)'
            }}>
              <div style={{ 
                color: '#fff', 
                fontSize: '0.9rem',
                fontWeight: 500,
                marginBottom: '8px' 
              }}>
                BetaVision (Analysis)
              </div>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}>
                <button
                  onClick={() => setSelectedModel('betavision')}
                  style={{
                    background: selectedModel === 'betavision' ? 'rgba(20,124,229,0.2)' : 'rgba(255,255,255,0.05)',
                    border: '1px solid ' + (selectedModel === 'betavision' ? '#147ce5' : 'rgba(255,255,255,0.1)'),
                    borderRadius: '4px',
                    padding: '8px 12px',
                    color: '#fff',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  BetaVision v1
                  <span style={{ 
                    fontSize: '0.7rem',
                    padding: '2px 6px',
                    background: 'rgba(52,199,89,0.2)',
                    borderRadius: '10px',
                    color: '#34c759'
                  }}>
                    Active
                  </span>
                </button>
                <button
                  disabled
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '4px',
                    padding: '8px 12px',
                    color: '#666',
                    textAlign: 'left',
                    cursor: 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  BetaVision v2
                  <span style={{ 
                    fontSize: '0.7rem',
                    padding: '2px 6px',
                    background: 'rgba(255,149,0,0.2)',
                    borderRadius: '10px',
                    color: '#ff9500'
                  }}>
                    Coming Soon
                  </span>
                </button>
              </div>
            </div>

            {/* Currently Active Info + HW brief */}
            <div style={{
              padding: '12px',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              fontSize: '0.8rem'
            }}>
              <div style={{ color: '#147ce5' }}>
                Currently Active: BetaSR v1 + BetaVision v1
              </div>
              {systemInfo && (
                <div style={{
                  marginTop: 8,
                  padding: '6px 8px',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 6,
                  fontSize: '0.72rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                }}>
                  <div style={{ color: '#9ca3af' }}>
                    🖥 <span style={{ color: '#d1d5db' }}>{systemInfo.device.name}</span>
                  </div>
                  <div style={{ color: '#9ca3af' }}>
                    Backend: <span style={{ color: systemInfo.model.quantized ? '#34d399' : '#e5e7eb' }}>
                      {systemInfo.model.format}
                    </span>
                    {systemInfo.model.quantized && (
                      <span style={{
                        marginLeft: 6, padding: '1px 5px',
                        background: 'rgba(52,211,153,0.15)',
                        color: '#34d399',
                        borderRadius: 4,
                        fontSize: '0.65rem',
                        border: '1px solid rgba(52,211,153,0.3)'
                      }}>QUANTIZED</span>
                    )}
                  </div>
                </div>
              )}
              <div style={{ 
                color: '#666',
                marginTop: '4px',
                fontSize: '0.75rem'
              }}>
                More models coming soon...
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleChatMessage = (text) => {
    setChatMessages((prev) => [...prev, { role: "user", text }]);
    // Simula una risposta semplice
    setTimeout(() => {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: "I understand your message: " + text }
      ]);
    }, 600);
  };

  // Update or add the Image Metrics button handler
  const handleMetricsClick = () => {
    setPsnrVisible(true);
    setShowMetrics(true);
    // Ensure we have metrics data
    if (originalUrl) {
      computeMetrics("preprocessed", setOriginalMetrics);
    }
    if (distortedUrl) {
      computeMetrics("distorted", setDistortedMetrics);
    }
    if (denoisedUrl) {
      computeMetrics("denoised", setDenoisedMetrics);
    }
  };

  // Aggiorna la gestione delle metriche con logging
  const handleMetricsToggle = () => {
    const newState = !showMetrics;
    setShowMetrics(newState);
    // Se viene attivato, calcola le metriche
    if (newState) {
      if (originalUrl) computeMetrics("preprocessed", setOriginalMetrics);
      if (distortedUrl) computeMetrics("distorted", setDistortedMetrics);
      if (denoisedUrl) computeMetrics("denoised", setDenoisedMetrics);
    }
  };

  // Aggiorna il componente AdvancedTools
  const AdvancedTools = () => (
    <div className="panel">
      <h3 className="panel-heading">Advanced Tools</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          cursor: 'pointer',
          padding: '8px',
          borderRadius: '4px',
          backgroundColor: showMetrics ? 'rgba(20, 124, 229, 0.2)' : 'transparent'
        }}>
          <input
            type="checkbox"
            checked={showMetrics}
            onChange={handleMetricsToggle}
          />
          Image Metrics (PSNR/SSIM)
        </label>
        
        <label style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          cursor: 'pointer',
          padding: '8px',
          borderRadius: '4px',
          backgroundColor: measureMode ? 'rgba(20, 124, 229, 0.2)' : 'transparent'
        }}>
          <input
            type="checkbox"
            checked={measureMode}
            onChange={() => setMeasureMode(!measureMode)}
          />
          Distance Measurement
        </label>
        
        <label style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          cursor: 'pointer',
          padding: '8px',
          borderRadius: '4px',
          backgroundColor: segmentMode ? 'rgba(20, 124, 229, 0.2)' : 'transparent'
        }}>
          <input
            type="checkbox"
            checked={segmentMode}
            onChange={handleSegmentationToggle}
          />
          ROI Segmentation
        </label>
      </div>
    </div>
  );

  // Finestra delle metriche trascinabile
  const MetricsWindow = () => {
    // Usa il hook per renderla trascinabile
    const { windowRef, position, size, onMouseDownBar } = 
      useDraggableResizable({ x: 600, y: 120 }, { width: 320, height: 'auto' });

    if (!showMetrics) return null;

    const cardStyle = {
      backgroundColor: '#222',
      borderRadius: '6px',
      padding: '12px',
      marginBottom: '10px',
      border: '1px solid #333'
    };

    const buttonStyle = {
      backgroundColor: '#2c2c2c',
      color: '#fff',
      border: '1px solid #444',
      padding: '6px 10px',
      marginTop: '8px',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '0.85rem',
      transition: 'all 0.2s ease'
    };

    const metricValueStyle = {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '4px 0',
      borderBottom: '1px solid #333'
    };

    return (
      <div 
        ref={windowRef} 
        style={{
          position: "fixed",
          left: position.x,
          top: position.y,
          width: size.width,
          backgroundColor: '#1a1a1a',
          color: 'white',
          zIndex: 9999,
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          border: '1px solid #444'
        }}
      >
        <div 
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 15px',
            backgroundColor: '#2a2a2a',
            borderBottom: '1px solid #444',
            cursor: 'grab'
          }}
          onMouseDown={onMouseDownBar}
        >
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 500 }}>Image Metrics</h3>
          <button 
            style={{
              backgroundColor: 'transparent',
              color: '#aaa',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.2rem',
              padding: '0 5px'
            }}
            onClick={() => setShowMetrics(false)}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '15px' }}>
          {/* Original Image Metrics */}
          <div style={cardStyle}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#ccc' }}>Original Image</h4>
            <button
              style={buttonStyle}
              onClick={() => {
                if (originalUrl) computeMetrics("preprocessed", setOriginalMetrics);
              }}
            >
              Compute Metrics
            </button>
            
            <div style={{marginTop: '10px'}}>
              <div style={metricValueStyle}>
                <span style={{color: '#aaa'}}>PSNR:</span>
                <span style={{fontWeight: 500, color: '#6097FF'}}>
                  {originalMetrics ? originalMetrics.psnr?.toFixed(2) + ' dB' : 'N/A'}
                </span>
              </div>
              <div style={metricValueStyle}>
                <span style={{color: '#aaa'}}>SSIM:</span>
                <span style={{fontWeight: 500, color: '#FFC400'}}>
                  {originalMetrics ? originalMetrics.ssim?.toFixed(3) : 'N/A'}
                </span>
              </div>
            </div>
          </div>
          
          {/* Distorted Image Metrics */}
          <div style={cardStyle}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#ccc' }}>Distorted Image</h4>
            <button
              style={buttonStyle}
              onClick={() => {
                if (distortedUrl) computeMetrics("distorted", setDistortedMetrics);
              }}
            >
              Compute Metrics
            </button>
            
            <div style={{marginTop: '10px'}}>
              <div style={metricValueStyle}>
                <span style={{color: '#aaa'}}>PSNR:</span>
                <span style={{fontWeight: 500, color: '#6097FF'}}>
                  {distortedMetrics ? distortedMetrics.psnr?.toFixed(2) + ' dB' : 'N/A'}
                </span>
              </div>
              <div style={metricValueStyle}>
                <span style={{color: '#aaa'}}>SSIM:</span>
                <span style={{fontWeight: 500, color: '#FFC400'}}>
                  {distortedMetrics ? distortedMetrics.ssim?.toFixed(3) : 'N/A'}
                </span>
              </div>
            </div>
          </div>
          
          {/* Enhanced Image Metrics */}
          <div style={cardStyle}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#ccc' }}>Enhanced Image</h4>
            <button
              style={buttonStyle}
              onClick={() => {
                if (denoisedUrl) computeMetrics("denoised", setDenoisedMetrics);
              }}
            >
              Compute Metrics
            </button>
            
            <div style={{marginTop: '10px'}}>
              <div style={metricValueStyle}>
                <span style={{color: '#aaa'}}>PSNR:</span>
                <span style={{fontWeight: 500, color: '#6097FF'}}>
                  {denoisedMetrics ? denoisedMetrics.psnr?.toFixed(2) + ' dB' : 'N/A'}
                </span>
              </div>
              <div style={metricValueStyle}>
                <span style={{color: '#aaa'}}>SSIM:</span>
                <span style={{fontWeight: 500, color: '#FFC400'}}>
                  {denoisedMetrics ? denoisedMetrics.ssim?.toFixed(3) : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Calcola il rettangolo delimitante
  const calculateBoundingBox = (points) => {
    if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    
    let minX = points[0].actualX;
    let minY = points[0].actualY;
    let maxX = points[0].actualX;
    let maxY = points[0].actualY;
    
    points.forEach(p => {
      minX = Math.min(minX, p.actualX);
      minY = Math.min(minY, p.actualY);
      maxX = Math.max(maxX, p.actualX);
      maxY = Math.max(maxY, p.actualY);
    });
    
    return {
      minX, minY, maxX, maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  };

  // Funzione per calcolare le statistiche della segmentazione (area, perimetro, ecc.)
  const calculateSegmentationStats = () => {
    if (segmentPoints.length < 3) return null;
    
    // Ottieni l'immagine di riferimento
    const img = new Image();
    img.src = originalUrl || distortedUrl;
    
    // Calcola l'area usando la formula del poligono
    let area = 0;
    let perimeter = 0;
    
    for (let i = 0; i < segmentPoints.length; i++) {
      const current = segmentPoints[i];
      const next = segmentPoints[(i + 1) % segmentPoints.length];
      
      // Formula di Shoelace per l'area
      area += current.actualX * next.actualY - next.actualX * current.actualY;
      
      // Calcola la distanza per il perimetro
      const dx = next.actualX - current.actualX;
      const dy = next.actualY - current.actualY;
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }
    
    area = Math.abs(area) / 2;
    
    // Pixel calibration (assume 1 pixel = 1mm, ma si può migliorare)
    const pixelCalibration = 1; // mm per pixel
    
    return {
      areaPixels: area,
      areaMm2: area * pixelCalibration * pixelCalibration,
      perimeterPixels: perimeter,
      perimeterMm: perimeter * pixelCalibration,
      boundingBox: calculateBoundingBox(segmentPoints),
      numPoints: segmentPoints.length
    };
  };

  // Funzione per gestire il click sulla segmentazione
  const handleSegmentClick = (x, y, imgWidth, imgHeight) => {
    if (!segmentMode || segmentComplete) return;
    
    // Aggiungi un nuovo punto
    setSegmentPoints(prevPoints => [...prevPoints, { x, y, actualX: x * imgWidth, actualY: y * imgHeight }]);
  };

  // Istruzioni visuali eleganti e informative
  const SegmentationInstructions = () => {
    if (!showSegmentInstructions) return null;
    
    return (
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '750px',
        backgroundColor: '#1a1a1a',
        border: '1px solid #444',
        borderRadius: '8px',
        padding: '25px',
        zIndex: 10000,
        boxShadow: '0 4px 20px rgba(0,0,0,0.7)'
      }}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #444', paddingBottom: '15px', marginBottom: '20px'}}>
          <h2 style={{color: '#fff', margin: 0}}>ROI Segmentation Instructions</h2>
          <button 
            onClick={() => setShowSegmentInstructions(false)}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#aaa',
              fontSize: '24px',
              cursor: 'pointer'
            }}
          >
            ×
          </button>
        </div>

        <div style={{display: 'flex', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '20px'}}>
          <div style={{flex: '0 0 80px', color: '#6097FF', fontSize: '40px', textAlign: 'center', fontWeight: 'bold'}}>
            1
          </div>
          <div style={{flex: '1'}}>
            <h3 style={{color: '#fff', margin: '0 0 10px'}}>Select Points to Define Your Region</h3>
            <div style={{display: 'flex', gap: '20px', marginTop: '15px'}}>
              <div style={{flex: '1', backgroundColor: '#222', padding: '15px', borderRadius: '8px', border: '1px solid #444'}}>
                <div style={{display: 'flex', alignItems: 'center', marginBottom: '10px'}}>
                  <div style={{
                    backgroundColor: '#4477cc', 
                    color: 'white', 
                    padding: '4px 10px', 
                    borderRadius: '4px', 
                    marginRight: '10px',
                    fontSize: '0.9rem',
                    fontWeight: 'bold'
                  }}>
                    LEFT CLICK
                  </div>
                  <span style={{color: 'white', fontWeight: '500'}}>Add a Point</span>
                </div>
                <p style={{color: '#ddd', margin: '0', fontSize: '0.9rem'}}>
                  Click on the image borders to create your region of interest.<br/>
                  <span style={{color: '#aaee77'}}>You need at least 3 points</span> to define a valid region.
                </p>
              </div>
              <div style={{flex: '1', backgroundColor: '#222', padding: '15px', borderRadius: '8px', border: '1px solid #444'}}>
                <div style={{display: 'flex', alignItems: 'center', marginBottom: '10px'}}>
                  <div style={{
                    backgroundColor: '#cc4444', 
                    color: 'white', 
                    padding: '4px 10px', 
                    borderRadius: '4px', 
                    marginRight: '10px',
                    fontSize: '0.9rem',
                    fontWeight: 'bold'
                  }}>
                    RIGHT CLICK
                  </div>
                  <span style={{color: 'white', fontWeight: '500'}}>Remove Last Point</span>
                </div>
                <p style={{color: '#ddd', margin: '0', fontSize: '0.9rem'}}>
                  Made a mistake? Right-click to undo your last point.<br/>
                  Continue adding points to create a precise outline.
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <div style={{display: 'flex', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '20px'}}>
          <div style={{flex: '0 0 80px', color: '#6097FF', fontSize: '40px', textAlign: 'center', fontWeight: 'bold'}}>
            2
          </div>
          <div style={{flex: '1'}}>
            <h3 style={{color: '#fff', margin: '0 0 10px'}}>Complete Your Segmentation</h3>
            <p style={{color: '#ddd', margin: '0 0 15px'}}>
              When you're satisfied with your region outline, click the "Complete Segmentation" button.
              This will finalize your selection and calculate medical metrics for the region.
            </p>
            <div style={{backgroundColor: '#222', padding: '15px', borderRadius: '8px', border: '1px solid #444'}}>
              <h4 style={{margin: '0 0 10px', color: '#fff'}}>Available Statistics</h4>
              <div style={{display: 'flex', flexWrap: 'wrap', gap: '15px'}}>
                <div style={{flex: '1', minWidth: '150px'}}>
                  <div style={{color: '#6097FF', fontSize: '0.9rem', fontWeight: 'bold'}}>Area (mm²)</div>
                  <div style={{color: '#ddd', fontSize: '0.85rem'}}>Total surface area of the region</div>
                </div>
                <div style={{flex: '1', minWidth: '150px'}}>
                  <div style={{color: '#6097FF', fontSize: '0.9rem', fontWeight: 'bold'}}>Perimeter (mm)</div>
                  <div style={{color: '#ddd', fontSize: '0.85rem'}}>Length of the region boundary</div>
                </div>
                <div style={{flex: '1', minWidth: '150px'}}>
                  <div style={{color: '#6097FF', fontSize: '0.9rem', fontWeight: 'bold'}}>Dimensions</div>
                  <div style={{color: '#ddd', fontSize: '0.85rem'}}>Width × Height of bounding box</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div style={{display: 'flex'}}>
          <div style={{flex: '0 0 80px', color: '#6097FF', fontSize: '40px', textAlign: 'center', fontWeight: 'bold'}}>
            3
          </div>
          <div style={{flex: '1'}}>
            <h3 style={{color: '#fff', margin: '0 0 10px'}}>Export Your Results</h3>
            <p style={{color: '#ddd', margin: '0 0 15px'}}>
              After completing your segmentation, you can export the results in multiple formats for further analysis.
            </p>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '15px'}}>
              <div style={{flex: '1', minWidth: '150px', backgroundColor: '#222', padding: '15px', borderRadius: '8px', border: '1px solid #444'}}>
                <div style={{color: '#FFC400', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '5px'}}>PNG Image</div>
                <div style={{color: '#ddd', fontSize: '0.85rem'}}>Image with overlay and statistics</div>
              </div>
              <div style={{flex: '1', minWidth: '150px', backgroundColor: '#222', padding: '15px', borderRadius: '8px', border: '1px solid #444'}}>
                <div style={{color: '#FFC400', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '5px'}}>JSON Format</div>
                <div style={{color: '#ddd', fontSize: '0.85rem'}}>Complete data for software integration</div>
              </div>
              <div style={{flex: '1', minWidth: '150px', backgroundColor: '#222', padding: '15px', borderRadius: '8px', border: '1px solid #444'}}>
                <div style={{color: '#FFC400', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '5px'}}>DICOM Compatible</div>
                <div style={{color: '#ddd', fontSize: '0.85rem'}}>For medical imaging systems</div>
              </div>
              <div style={{flex: '1', minWidth: '150px', backgroundColor: '#222', padding: '15px', borderRadius: '8px', border: '1px solid #444'}}>
                <div style={{color: '#FFC400', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '5px'}}>CSV Points</div>
                <div style={{color: '#ddd', fontSize: '0.85rem'}}>Coordinate data for analysis</div>
              </div>
            </div>
          </div>
        </div>
        
        <div style={{marginTop: '25px', textAlign: 'center'}}>
          <button 
            onClick={() => setShowSegmentInstructions(false)}
            style={{
              backgroundColor: '#6097FF',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '10px 20px',
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            Got it!
          </button>
        </div>
      </div>
    );
  };

  // Pannello unificato elegante per il controllo della segmentazione
  const SegmentationControlPanel = () => {
    if (!segmentMode) return null;
    
    return (
      <div style={{
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(30, 30, 30, 0.9)',
        border: '1px solid #444',
        borderRadius: '10px',
        padding: '15px 25px',
        zIndex: 1000,
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px'
        }}>
          {/* Conteggio punti e indicatore di stato */}
          <div>
            <div style={{color: '#aaa', fontSize: '0.85rem', marginBottom: '3px'}}>Points</div>
            <div style={{
              color: segmentPoints.length < 3 ? '#ff6b6b' : '#6bff6b',
              fontWeight: 'bold',
              fontSize: '1.1rem'
            }}>
              {segmentPoints.length} {segmentPoints.length < 3 ? '(min 3)' : ''}
            </div>
          </div>
          
          {/* Separatore verticale */}
          <div style={{width: '1px', height: '40px', backgroundColor: '#444'}}></div>
          
          {/* Pulsante Completa */}
          <button
            onClick={completeSegmentation}
            disabled={segmentPoints.length < 3 || segmentComplete}
            style={{
              padding: '8px 14px',
              backgroundColor: segmentComplete ? '#285e28' : '#34c759',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: segmentPoints.length < 3 ? 'not-allowed' : 'pointer',
              opacity: segmentPoints.length < 3 || segmentComplete ? 0.6 : 1,
              fontWeight: '500',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {segmentComplete ? (
              <>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                Segmentation Complete
              </>
            ) : (
              <>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                Complete Segmentation
              </>
            )}
          </button>
          
          {/* Pulsante Reset */}
          <button
            onClick={resetSegmentation}
            style={{
              padding: '8px 14px',
              backgroundColor: '#2c2c2c',
              color: '#ff6b6b',
              border: '1px solid #553333',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reset
          </button>
          
          {/* Separatore verticale */}
          <div style={{width: '1px', height: '40px', backgroundColor: '#444'}}></div>
          
          {/* Selezione formato esportazione */}
          <div>
            <div style={{color: '#aaa', fontSize: '0.85rem', marginBottom: '5px'}}>Export Format</div>
            <select 
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              style={{
                backgroundColor: '#2c2c2c',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '0.9rem'
              }}
              disabled={!segmentComplete}
            >
              <option value="png">PNG Image with Overlay</option>
              <option value="json">JSON Data</option>
              <option value="dicom">DICOM Compatible</option>
              <option value="csv">CSV Points</option>
            </select>
          </div>
          
          {/* Pulsante Esporta */}
          <button
            onClick={() => exportSegmentation(exportFormat)}
            disabled={!segmentComplete}
            style={{
              padding: '8px 14px',
              backgroundColor: '#2c2c2c',
              color: '#fff',
              border: segmentComplete ? '1px solid #FFC400' : '1px solid #555',
              borderRadius: '6px',
              cursor: segmentComplete ? 'pointer' : 'not-allowed',
              opacity: segmentComplete ? 1 : 0.6,
              fontWeight: '500',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
          
          {/* Separatore verticale */}
          <div style={{width: '1px', height: '40px', backgroundColor: '#444'}}></div>
          
          {/* Pulsante Aiuto */}
          <button
            onClick={() => setShowSegmentInstructions(true)}
            style={{
              padding: '8px 14px',
              backgroundColor: '#2c2c2c',
              color: '#6097FF',
              border: '1px solid #6097FF',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            Help
          </button>
        </div>
        
        {/* Mostra statistiche se la segmentazione è completata */}
        {segmentComplete && segmentationStats && (
          <div style={{
            marginTop: '15px',
            padding: '10px 15px',
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            borderRadius: '6px',
            display: 'flex',
            gap: '25px'
          }}>
            <div>
              <div style={{color: '#aaa', fontSize: '0.75rem'}}>Area</div>
              <div style={{color: '#6bff6b', fontWeight: 'bold'}}>
                {segmentationStats.areaMm2.toFixed(2)} mm²
              </div>
            </div>
            <div>
              <div style={{color: '#aaa', fontSize: '0.75rem'}}>Perimeter</div>
              <div style={{color: '#FFC400', fontWeight: 'bold'}}>
                {segmentationStats.perimeterMm.toFixed(2)} mm
              </div>
            </div>
            <div>
              <div style={{color: '#aaa', fontSize: '0.75rem'}}>Dimensions</div>
              <div style={{color: '#6097FF', fontWeight: 'bold'}}>
                {segmentationStats.boundingBox.width.toFixed(1)} × {segmentationStats.boundingBox.height.toFixed(1)} px
              </div>
            </div>
            <div>
              <div style={{color: '#aaa', fontSize: '0.75rem'}}>Points</div>
              <div style={{color: '#fff', fontWeight: 'bold'}}>
                {segmentationStats.numPoints}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleSegmentationComplete = (points) => {
    setSegmentPoints(points);
    setSegmentComplete(true);
    setShowSaveConfirm(true);
  };
  
  const handleSaveConfirm = (confirmed) => {
    setShowSaveConfirm(false);
    if (confirmed) {
      exportSegmentation(exportFormat, segmentPoints);
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.brandGroup}>
          <h1 style={{ margin: 0 }}>BETACLARITY</h1>
          <span
            style={{
              fontSize: "0.7rem",
              padding: "3px 12px",
              border: "1.5px solid rgba(255, 255, 255, 0.95)",
              borderRadius: "14px",
              color: "rgba(255, 255, 255, 0.95)",
              backgroundColor: "transparent",
              textTransform: "lowercase",
              letterSpacing: "1px",
              fontWeight: "400",
              fontFamily: "'Inter', sans-serif"
            }}
          >
            BetaSR
          </span>
        </div>
        <ProcessingBar />
      </header>

      {/* Main Layout */}
      <div style={styles.mainLayout}>
        {/* Left Panel */}
        <div style={styles.leftPanel}>
          {/* Models + Hardware status */}
          <div style={styles.panel}>
            <h3 style={styles.panelHeading}>Models</h3>
            <ModelsButton />
            <p style={{ marginTop: "6px", color: "#888", fontSize: "0.8rem" }}>
              Currently: {selectedModel === "betasr" ? "BetaSR v1" : "BetaVision v1"}
            </p>
            <HardwareStatusBar />
            <HardwareSelector />
            <ActivityMonitor />
          </div>

          {/* Upload Image */}
          <div style={styles.panel}>
            <h3 style={styles.panelHeading}>Upload Image</h3>

            {/* Modality selector — kept for session metadata only */}
            <label style={{ color: "#aaa", fontSize: "0.78rem", display: "block", marginBottom: 4 }}>
              Modality
            </label>
            <select
              value={selectedModality}
              onChange={(e) => setSelectedModality(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 10px",
                marginBottom: "14px",
                backgroundColor: "#1a1a1a",
                color: "#fff",
                border: "1px solid #333",
                borderRadius: "6px",
                fontSize: "0.85rem"
              }}
            >
              {MODALITIES.map((mod) => (
                <option key={mod} value={mod}>{mod}</option>
              ))}
            </select>

            {/* Drop zone / upload button */}
            <div
              onClick={processing ? undefined : handleChooseFileClick}
              style={{
                border: "1.5px dashed #147ce5",
                borderRadius: 10,
                padding: "22px 14px",
                textAlign: "center",
                cursor: processing ? "not-allowed" : "pointer",
                background: "rgba(20,124,229,0.04)",
                transition: "background 0.15s",
              }}
            >
              <svg width="28" height="28" fill="none" stroke="#147ce5" strokeWidth="1.5" viewBox="0 0 24 24"
                style={{ margin: "0 auto 8px", display: "block" }}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 12l-4-4m0 0L8 12m4-4v12"/>
              </svg>
              <p style={{ color: "#fff", fontSize: "0.85rem", fontWeight: 500, margin: "0 0 4px" }}>
                Upload File
              </p>
              <p style={{ color: "#666", fontSize: "0.72rem", margin: 0 }}>
                DICOM · PNG · JPG · JPEG
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".dcm,.png,.jpg,.jpeg"
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />

            {/* Info note */}
            <div style={{
              marginTop: 10,
              padding: "8px 10px",
              background: "rgba(255,255,255,0.03)",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.06)",
              fontSize: "0.7rem",
              color: "#555",
              lineHeight: 1.5,
            }}>
              Upload your own medical image. No sample images from public
              datasets are included. Your file is processed locally inside the
              container and never sent to external servers.
            </div>
          </div>

          {/* Distortion + Enhancement */}
          <div style={styles.panel}>
            <h3 style={styles.panelHeading}>Distortion</h3>
            <label style={{ color: "#ccc", display: "block", marginBottom: "6px" }}>
              Distortion Type:
              <select
                value={distortionType}
                onChange={(e) => setDistortionType(e.target.value)}
                style={{
                  width: "100%",
                  borderRadius: "6px",
                  border: "1px solid #444",
                  backgroundColor: "#222",
                  color: "#fff",
                  padding: "6px",
                  marginTop: "4px"
                }}
              >
                <option value="gaussian">Gaussian</option>
                <option value="salt">Salt &amp; Pepper</option>
                <option value="speckle">Speckle</option>
                <option value="poisson">Poisson</option>
              </select>
            </label>
            <label style={{ color: "#ccc", display: "block", marginBottom: "6px" }}>
              Distortion Level: {distortionLevel.toFixed(2)}
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={distortionLevel}
                onChange={(e) => setDistortionLevel(parseFloat(e.target.value))}
                style={rangeInputStyle}
              />
            </label>
            <label style={{ color: "#ccc", display: "block", marginBottom: "6px" }}>
              Scale Factor: {scaleFactor.toFixed(1)}x
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={scaleFactor}
                onChange={(e) => setScaleFactor(parseFloat(e.target.value))}
                style={rangeInputStyle}
              />
            </label>
            <button
              onClick={handleApplyDistortion}
              disabled={processing}
              style={{
                backgroundColor: "#147ce5",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                padding: "8px 12px",
                fontSize: "0.85rem",
                fontWeight: 500,
                cursor: processing ? "not-allowed" : "pointer",
                width: "100%",
                marginTop: "10px"
              }}
            >
              Distort
            </button>

            <hr style={{ borderColor: "#444", margin: "12px 0" }} />

            <h3 style={styles.panelHeading}>Enhancement</h3>
            <label style={{ color: "#ccc", display: "block", marginBottom: "6px" }}>
              Enhancement Level: {enhancementLevel}
              <input
                type="range"
                min={1}
                max={100}
                step={1}
                value={enhancementLevel}
                onChange={(e) => setEnhancementLevel(parseInt(e.target.value))}
                style={rangeInputStyle}
              />
            </label>
            <p style={{ color: "#888", fontSize: "0.8rem", margin: "4px 0" }}>
              Higher levels = more steps (slower).
            </p>
            <button
              onClick={handlePerformInference}
              disabled={processing || !distortedUrl}
              style={{
                backgroundColor: "#ff8c00",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                padding: "8px 12px",
                fontSize: "0.85rem",
                fontWeight: 500,
                cursor: processing || !distortedUrl ? "not-allowed" : "pointer",
                width: "100%",
                marginBottom: "20px"
              }}
            >
              Enhance
            </button>

            <div style={{
              background: 'linear-gradient(180deg, rgba(26,26,26,0.8) 0%, rgba(32,32,32,0.9) 100%)',
              borderRadius: '8px',
              padding: '15px',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <h3 style={{
                ...styles.panelHeading,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#fff',
                fontSize: '1rem',
                marginTop: 0,
                marginBottom: '15px'
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
                Advanced Tools
              </h3>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                {/* Image Metrics */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px',
                  background: 'rgba(20,124,229,0.1)',
                  borderRadius: '6px',
                  border: '1px solid rgba(20,124,229,0.2)'
                }}>
                  <input
                    type="checkbox"
                    id="showMetrics"
                    checked={showMetrics}
                    onChange={() => setShowMetrics(s => !s)}
                    style={{ marginRight: '10px' }}
                  />
                  <label htmlFor="showMetrics" style={{ 
                    color: '#fff',
                    flex: 1,
                    fontSize: '0.9rem'
                  }}>
                    Image Metrics (PSNR/SSIM)
                  </label>
                </div>

                {/* Distance Measurement */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px',
                  background: 'rgba(255,140,0,0.1)',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,140,0,0.2)'
                }}>
                  <input
                    type="checkbox"
                    id="measureTool"
                    checked={measureMode}
                    onChange={() => {
                      setMeasureMode(m => !m);
                      if (!measureMode) setSegmentMode(false);
                    }}
                    style={{ marginRight: '10px' }}
                  />
                  <label htmlFor="measureTool" style={{ 
                    color: '#fff',
                    flex: 1,
                    fontSize: '0.9rem'
                  }}>
                    Distance Measurement
                  </label>
                </div>

                {/* ROI Segmentation */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px',
                  background: 'rgba(255,0,0,0.1)',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,0,0,0.2)'
                }}>
                  <input
                    type="checkbox"
                    id="segmentTool"
                    checked={segmentMode}
                    onChange={() => {
                      setSegmentMode(s => !s);
                      if (!segmentMode) setMeasureMode(false);
                    }}
                    style={{ marginRight: '10px' }}
                  />
                  <label htmlFor="segmentTool" style={{ 
                    color: '#fff',
                    flex: 1,
                    fontSize: '0.9rem'
                  }}>
                    ROI Segmentation
                  </label>
                </div>


              </div>
            </div>
          </div>

          {/* Transfer Back to Medical Interface */}
          <div style={styles.panel}>
            <h3 style={styles.panelHeading}>Transfer Back</h3>
            <button
              onClick={handleTransferBack}
              disabled={!denoisedUrl}
              style={{
                backgroundColor: denoisedUrl ? "#34c759" : "#8e8e93",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "14px 20px",
                fontSize: "0.95rem",
                fontWeight: 600,
                width: "100%",
                cursor: denoisedUrl ? "pointer" : "not-allowed",
                opacity: denoisedUrl ? 1 : 0.6,
                transition: "all 0.2s ease",
                letterSpacing: "0.5px"
              }}
            >
              Return Image
            </button>
            <p style={{
              fontSize: "0.75rem",
              color: "#666",
              margin: "8px 0 0 0",
              textAlign: "center"
            }}>
              {denoisedUrl ? "Enhanced image ready to transfer" : "Apply enhancement first"}
            </p>
          </div>
        </div>

        {/* Right Grid (Original, Distorted, Enhanced) */}
        <div style={styles.rightGrid}>
          {/* Original */}
          <div style={styles.square}>
            <h4 style={{ margin: 0, marginBottom: "6px", fontWeight: 600 }}>
              Original
            </h4>
            <div style={styles.imageContainer}>
              <ImagePreview
                src={originalUrl}
                alt="Original"
                onClick={(src) => setFullscreenSrc(src)}
                onZoomClick={setZoomPoint}
                measureMode={measureMode}
                segmentMode={segmentMode}
                sessionId={sessionId}
              />
            </div>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "#888" }}>
              Right-click to zoom, left-click for fullscreen
            </p>
          </div>

          {/* Distorted */}
          <div style={styles.square}>
            <h4 style={{ margin: 0, marginBottom: "6px", fontWeight: 600 }}>
              Distorted
            </h4>
            <div style={styles.imageContainer}>
              <ImagePreview
                src={distortedUrl}
                alt="Distorted"
                onClick={(src) => setFullscreenSrc(src)}
                onZoomClick={setZoomPoint}
                measureMode={measureMode}
                segmentMode={segmentMode}
                sessionId={sessionId}
              />
            </div>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "#888" }}>
              Right-click to zoom, left-click for fullscreen
            </p>
          </div>

          {/* Enhanced */}
          <div style={styles.square}>
            <h4 style={{ margin: 0, marginBottom: "6px", fontWeight: 600 }}>
              Enhanced
            </h4>
            <div style={styles.imageContainer}>
              <ImagePreview
                src={denoisedUrl}
                alt="Enhanced"
                onClick={(src) => setFullscreenSrc(src)}
                onZoomClick={setZoomPoint}
                measureMode={measureMode}
                segmentMode={segmentMode}
                sessionId={sessionId}
              />
            </div>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "#888" }}>
              Right-click to zoom, left-click for fullscreen
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <Footer />

      {/* Fullscreen overlay */}
      <FullscreenOverlay
        src={fullscreenSrc}
        onClose={() => setFullscreenSrc(null)}
      />

      {/* Zoom window */}
      <ZoomWindow
        visible={!!zoomPoint}
        zoomPoint={zoomPoint}
        onClose={() => setZoomPoint(null)}
        originalUrl={originalUrl}
        distortedUrl={distortedUrl}
        denoisedUrl={denoisedUrl}
      />

      {/* PSNR/SSIM panel */}
      <PsnrWindow
        visible={psnrVisible}
        minimized={psnrMinimized}
        onClose={() => {
          console.log("Closing PSNR window");
          setPsnrVisible(false);
          setPsnrMinimized(false);
          setShowMetrics(false);
        }}
        onMinimize={() => {
          console.log("Minimizing PSNR window");
          setPsnrMinimized(!psnrMinimized);
        }}
        dataSets={[
          originalMetrics && {
            label: "Original",
            metrics: originalMetrics
          },
          distortedMetrics && {
            label: "Distorted",
            metrics: distortedMetrics
          },
          denoisedMetrics && {
            label: "Enhanced",
            metrics: denoisedMetrics
          }
        ].filter(Boolean)}
      />

      {/* Model selection window */}
      <ModelPanel
        visible={modelPanelVisible}
        onClose={() => setModelPanelVisible(false)}
        selectedModel={selectedModel}
        onSelectModel={(m) => {
          setSelectedModel(m);
          setModelPanelVisible(false);
        }}
      />

      <ReportModal />
      <AIReportWindow 
        visible={aiReportVisible}
        onClose={() => setAIReportVisible(false)}
        reportType={reportType}
        imageUrl={denoisedUrl}
      />

      {/* BetaVision Chat */}
      <BetaVisionChat 
        visible={chatVisible}
        onClose={() => setChatVisible(false)}
        initialPrompt={initialPrompt}
      />

      {/* In the toolbar/button section where PSNR is triggered, update or add: */}
      <button
        onClick={handleMetricsClick}
        disabled={!originalUrl} // Disable if no image is loaded
        style={{
          backgroundColor: "#444",
          color: "#fff",
          border: "none",
          padding: "8px 12px",
          borderRadius: "4px",
          cursor: originalUrl ? "pointer" : "not-allowed",
          fontSize: "0.9rem",
          opacity: originalUrl ? 1 : 0.5,
          display: "flex",
          alignItems: "center",
          gap: "6px"
        }}
      >
      </button>

      <MetricsWindow />
      <SegmentationInstructions />
      <SegmentationControlPanel />
      
      {/* Confirmation dialog for saving segmentation */}
      {showSaveConfirm && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-content">
              <h3>Segmentation completed!</h3>
              <p>Do you want to save it for AI training?</p>
              <div className="modal-buttons">
                <button 
                  className="cancel-button"
                  onClick={() => handleSaveConfirm(false)}
                >
                  Annulla
                </button>
                <button 
                  className="confirm-button"
                  onClick={() => handleSaveConfirm(true)}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Rimuovi "Image Metrics" dalla parte inferiore (Footer)
// Sostituisci con una versione pulita
const Footer = () => (
  <div style={{
    padding: '10px 0',
    textAlign: 'center',
    borderTop: '1px solid #333',
    color: '#aaa',
    fontSize: '0.8rem'
  }}>
              © 2025 BetaClarity. All rights reserved.
  </div>
);

export default function BetaClarityPage() {
  return (
    <ProcessingProvider>
      <BetaClarityApp />
    </ProcessingProvider>
  );
}