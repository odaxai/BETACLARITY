import React, { useState } from 'react';

const ExportComponent = ({ segmentationData }) => {
  const [metrics, setMetrics] = useState({
    area: 0,
    perimeter: 0,
    volume: 0
  });

  // Funzione per calcolare le metriche
  const calculateMetrics = () => {
    // Simulazione di calcolo delle metriche (da sostituire con logica reale)
    const calculatedArea = segmentationData ? segmentationData.length * 0.5 : 0;
    const calculatedPerimeter = calculatedArea * 4;
    const calculatedVolume = calculatedArea * 2.5;
    
    setMetrics({
      area: calculatedArea.toFixed(2),
      perimeter: calculatedPerimeter.toFixed(2),
      volume: calculatedVolume.toFixed(2)
    });
    
    return { area: calculatedArea, perimeter: calculatedPerimeter, volume: calculatedVolume };
  };

  // Funzione per esportare in JSON
  const exportJSON = () => {
    const metrics = calculateMetrics();
    const jsonData = {
      segmentation: segmentationData,
      metrics: metrics
    };
    
    downloadFile(
      JSON.stringify(jsonData, null, 2),
      'segmentation-data.json',
      'application/json'
    );
  };

  // Funzione per esportare in formato COCO
  const exportCOCO = () => {
    const metrics = calculateMetrics();
    const cocoData = {
      images: [{
        id: 1,
        width: 800,
        height: 600
      }],
      annotations: [{
        id: 1,
        image_id: 1,
        category_id: 1,
        segmentation: [segmentationData || []],
        area: metrics.area,
        bbox: [100, 100, 200, 200] // esempio
      }],
      categories: [{
        id: 1,
        name: "region"
      }]
    };
    
    downloadFile(
      JSON.stringify(cocoData, null, 2),
      'segmentation-coco.json',
      'application/json'
    );
  };

  // Funzione per esportare in formato YOLO
  const exportYOLO = () => {
    // Simulazione formato YOLO (da adattare alla tua logica)
    const yoloData = "1 0.5 0.5 0.4 0.3";
    downloadFile(
      yoloData,
      'segmentation-yolo.txt',
      'text/plain'
    );
  };

  // Funzione per esportare in formato DICOM Segmentation
  const exportDICOM = () => {
    alert("Esportazione DICOM è in fase di implementazione. Questa funzionalità richiede una libreria DICOM specifica.");
  };

  // Funzione per esportare in formato NIfTI
  const exportNIfTI = () => {
    alert("Esportazione NIfTI è in fase di implementazione. Questa funzionalità richiede una libreria NIfTI specifica.");
  };

  // Funzione per esportare maschera binaria
  const exportBinaryMask = () => {
    // Simulazione maschera binaria come array di 0 e 1
    const binaryMask = [1,0,0,1,1,0,1,0]; // Esempio
    downloadFile(
      JSON.stringify(binaryMask),
      'binary-mask.json',
      'application/json'
    );
  };

  // Funzione per generare report
  const generateReport = () => {
    const metrics = calculateMetrics();
    const reportData = `
      REPORT DI SEGMENTAZIONE
      ------------------------
      Data: ${new Date().toLocaleDateString()}
      Ora: ${new Date().toLocaleTimeString()}
      
      METRICHE:
      Area: ${metrics.area} mm²
      Perimetro: ${metrics.perimeter} mm
      Volume stimato: ${metrics.volume} mm³
      
      NOTE:
      Questo report è stato generato automaticamente.
    `;
    
    downloadFile(
      reportData,
      'segmentation-report.txt',
      'text/plain'
    );
  };

  // Funzione di utilità per scaricare file
  const downloadFile = (content, fileName, contentType) => {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="export-panel">
      <h3>Esportazione e Analisi</h3>
      
      <div className="export-buttons">
        <button className="export-btn" onClick={exportJSON}>Export JSON</button>
        <button className="export-btn" onClick={exportCOCO}>Export COCO</button>
        <button className="export-btn" onClick={exportYOLO}>Export YOLO</button>
        <button className="export-btn" onClick={exportBinaryMask}>Export Binary Mask</button>
        <button className="export-btn" onClick={exportDICOM}>Export DICOM</button>
        <button className="export-btn" onClick={exportNIfTI}>Export NIfTI</button>
      </div>
      
      <div className="metrics-panel">
        <h4>Metriche Calcolate:</h4>
        <table>
          <tbody>
            <tr>
              <td>Area:</td>
              <td>{metrics.area} mm²</td>
            </tr>
            <tr>
              <td>Perimetro:</td>
              <td>{metrics.perimeter} mm</td>
            </tr>
            <tr>
              <td>Volume stimato:</td>
              <td>{metrics.volume} mm³</td>
            </tr>
          </tbody>
        </table>
        <button className="report-btn" onClick={generateReport}>Genera Report Completo</button>
      </div>
      
      <style jsx>{`
        .export-panel {
          background-color: #f5f5f5;
          border-radius: 8px;
          padding: 15px;
          margin: 20px 0;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        h3, h4 {
          margin-top: 0;
          color: #333;
        }
        
        .export-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 20px;
        }
        
        .export-btn, .report-btn {
          background-color: #2c3e50;
          color: white;
          border: none;
          padding: 8px 15px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: background-color 0.3s;
        }
        
        .export-btn:hover, .report-btn:hover {
          background-color: #1a252f;
        }
        
        .report-btn {
          background-color: #27ae60;
          margin-top: 15px;
        }
        
        .report-btn:hover {
          background-color: #219653;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
        }
        
        td {
          padding: 8px;
          border-bottom: 1px solid #ddd;
        }
      `}</style>
    </div>
  );
};

export default ExportComponent; 