import React, { useRef, useEffect } from 'react';
import * as cornerstone from 'cornerstone-core';
import cornerstoneTools from 'cornerstone-tools';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import './styles/dicomViewer.css';

// Configurazione di cornerstoneWADOImageLoader
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;

export default function DICOMViewer() {
  const dicomElement = useRef(null);

  useEffect(() => {
    if (dicomElement.current) {
      // Abilita Cornerstone sul div
      cornerstone.enable(dicomElement.current);

      // Imposta un'immagine vuota o di esempio se necessario
      const exampleImageId = 'wadouri:http://example.com/path/to/your/dicom.dcm';
      cornerstone.loadImage(exampleImageId).then((image) => {
        cornerstone.displayImage(dicomElement.current, image);
      }).catch((error) => {
        console.error('Error loading DICOM image:', error);
      });
    }

    // Cleanup per disabilitare cornerstone al termine
    return () => {
      if (dicomElement.current) {
        cornerstone.disable(dicomElement.current);
      }
    };
  }, []);

  return (
    <div className="dicom-viewer" ref={dicomElement}>
      <div className="dicom-placeholder">No Image Loaded</div>
    </div>
  );
}
