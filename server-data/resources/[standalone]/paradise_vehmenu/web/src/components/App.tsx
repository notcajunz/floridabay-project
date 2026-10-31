import React, { useEffect, useState } from "react";
import "./App.css";
import { debugData } from "../utils/debugData";
import { fetchNui } from "../utils/fetchNui";
import { useVisibility } from "../providers/VisibilityProvider";
import { useNuiEvent } from "../hooks/useNuiEvent";

import leftDoorIcon from '../assets/left-door.png';
import rightDoorIcon from '../assets/right-door.png';
import rearLeftDoorIcon from '../assets/left-door.png';
import rearRightDoorIcon from '../assets/right-door.png';

import leftWindowIcon from '../assets/left-window.png';
import rightWindowIcon from '../assets/right-window.png';
import rearLeftWindowIcon from '../assets/left-window.png';
import rearRightWindowIcon from '../assets/right-window.png';

import driverSeatIcon from '../assets/car-seat.png';
import passengerSeatIcon from '../assets/car-seat.png';
import rearLeftSeatIcon from '../assets/car-seat.png';
import rearRightSeatIcon from '../assets/car-seat.png';

import trunkIcon from '../assets/car-trunk.png';
import hoodIcon from '../assets/car-hood.png';
import musicIcon from '../assets/car-music.png';

debugData([
  {
    action: "setVisible",
    data: true,
  },
]);

interface Control {
  id: string;
  label: string;
  icon: string;
  highlight?: boolean;
}

interface ControlSection {
  title: string;
  controls: Control[];
}

type ControlStates = Record<string, boolean>;

interface NuiResponse {
  success: boolean;
  states?: ControlStates;
}

interface VehicleInfoResponse extends NuiResponse {
  seatingCapacity: number;
}

// Lighting icons are inline data URIs so the menu needs no extra image files.
const svgIcon = (body: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  )}`;

const headlightIcon = svgIcon(
  '<path d="M10 5c-4 0-7 3-7 7s3 7 7 7c1.5 0 2-1 2-2V7c0-1.3-.5-2-2-2z"/><path d="M16 8h5M16 12h5M16 16h5"/>'
);
const highBeamIcon = svgIcon(
  '<path d="M9 5c-3.6 0-6 3-6 7s2.4 7 6 7c1.3 0 1.8-1 1.8-2V7c0-1.3-.5-2-1.8-2z"/><path d="M14 5l7-2M14 9h7M14 13h7M14 17l7 2"/>'
);
const interiorLightIcon = svgIcon(
  '<path d="M4 15c0-4.400 3.600-8 8-8s8 3.600 8 8z"/><path d="M12 7V4M3.500 19h17"/>'
);

const App: React.FC = () => {
  const { visible, setVisible } = useVisibility();
  const [activeControls, setActiveControls] = useState<Record<string, boolean>>({});
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDevelopment, setIsDevelopment] = useState(false);
  const [seatingCapacity, setSeatingCapacity] = useState<number>(4);

  // Windows and seats cannot be read back from the game, so only the reported states replace the local ones.
  const mergeStates = (states?: ControlStates) => {
    if (states) setActiveControls(prev => ({ ...prev, ...states }));
  };

  useNuiEvent<{ newSeat: string; oldSeat: string }>('seatChanged', (data) => {
    setActiveControls(prev => {
      const newState = { ...prev };
      if (data.oldSeat) {
        newState[data.oldSeat] = false;
      }
      newState[data.newSeat] = true;
      return newState;
    });
  });

  useEffect(() => {
    if (visible) {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 500);
      fetchNui<VehicleInfoResponse>('getVehicleInfo', {}).then((response) => {
        if (response?.success) {
          setSeatingCapacity(response.seatingCapacity);
          mergeStates(response.states);
        }
      });
    }
  }, [visible]);

  const handleToggleMenu = () => {
    setVisible(!visible);
  };

  const getSeatControls = () => {
    const seats = [
      { id: 'driver_seat', label: 'Driver', icon: driverSeatIcon },
      { id: 'passenger_seat', label: 'Passenger', icon: passengerSeatIcon },
    ];

    if (seatingCapacity > 2) {
      seats.push(
        { id: 'rear_left_seat', label: 'Rear Left', icon: rearLeftSeatIcon }
      );
    }
    if (seatingCapacity > 3) {
      seats.push(
        { id: 'rear_right_seat', label: 'Rear Right', icon: rearRightSeatIcon }
      );
    }
    if (seatingCapacity > 4) {
      seats.push(
        { id: 'rear_middle_seat', label: 'Rear Middle', icon: rearLeftSeatIcon }
      );
    }
    if (seatingCapacity > 5) {
      seats.push(
        { id: 'rear_extra_seat', label: 'Rear Extra', icon: rearRightSeatIcon }
      );
    }

    return seats;
  };

  const controlSections: Record<string, ControlSection> = {
    doors: {
      title: 'Doors',
      controls: [
        { id: 'left_door', label: 'Left', icon: leftDoorIcon },
        { id: 'right_door', label: 'Right', icon: rightDoorIcon },
        { id: 'rear_left_door', label: 'Rear Left', icon: rearLeftDoorIcon },
        { id: 'rear_right_door', label: 'Rear Right', icon: rearRightDoorIcon }
      ]
    },
    windows: {
      title: 'Windows',
      controls: [
        { id: 'left_window', label: 'Left', icon: leftWindowIcon },
        { id: 'right_window', label: 'Right', icon: rightWindowIcon },
        { id: 'rear_left_window', label: 'Rear Left', icon: rearLeftWindowIcon },
        { id: 'rear_right_window', label: 'Rear Right', icon: rearRightWindowIcon }
      ]
    },
    seats: {
      title: 'Seats',
      controls: getSeatControls()
    },
    others: {
      title: 'Others',
      controls: [
        { id: 'trunk', label: 'Trunk', icon: trunkIcon },
        { id: 'hood', label: 'Hood', icon: hoodIcon },
        { id: 'music', label: 'Music', icon: musicIcon }
      ]
    },
    lights: {
      title: 'Lights',
      controls: [
        { id: 'headlights', label: 'Headlights', icon: headlightIcon, highlight: true },
        { id: 'highbeams', label: 'High Beams', icon: highBeamIcon, highlight: true },
        { id: 'interior', label: 'Interior', icon: interiorLightIcon, highlight: true }
      ]
    }
  };

  const handleControlClick = async (controlId: string) => {
    try {
      const newState = !activeControls[controlId];
      // console.log('Sending control:', controlId, newState);
      
      const response = await fetchNui<NuiResponse>('vehicleControl', {
        controlId,
        state: newState
      });
      
      if (response?.success) {
        // Music opens the car audio panel and the engine command can be refused, so they are not blindly toggled.
        if (controlId !== 'music') {
          setActiveControls(prev => ({ ...prev, [controlId]: newState }));
        }
        mergeStates(response.states);
      } else {
        console.error('Failed to receive response from server');
      }
    } catch (e) {
      console.error('Failed to send control state:', e);
    }
  };

  const renderControlSection = (section: string) => {
    const sectionData = controlSections[section];
    return (
      <div className={`control-section control-section-${section}`}>
        <div className="section-title">{sectionData.title}</div>
        <div className="hex-grid">
          {sectionData.controls.map((control) => (
            <button
              key={control.id}
              className={`hex-button ${control.highlight ? 'highlight' : ''} ${activeControls[control.id] ? 'active' : ''}`}
              aria-pressed={!!activeControls[control.id]}
              onClick={() => handleControlClick(control.id)}
            >
              <div className="hex-content">
                <img 
                  src={control.icon} 
                  alt={control.label} 
                  className="control-icon"
                  style={{ width: '2.4vh', height: '2.4vh' }}
                />
                <div className="hex-label">{control.label}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      {isDevelopment && (
        <div className="dev-controls">
          <button className="dev-button" onClick={handleToggleMenu}>
            {visible ? 'Close Menu' : 'Open Menu'}
          </button>
        </div>
      )}
      <div className={`vehicle-controls ${visible ? 'visible' : 'hidden'}`}>
        <div className="engine-start">
          <button 
            className="hex-button large"
            onClick={() => handleControlClick('engine')}
          >
            <div className="hex-content">
              <span className="hex-label">ENGINE</span>
              <span className="hex-sublabel">{activeControls.engine ? 'STOP' : 'START'}</span>
            </div>
          </button>
        </div>
        <div className="controls-divider">
          <div className="divider-left"></div>
          <div className="divider-right"></div>
        </div>
        <div className="controls-grid">
          {renderControlSection("doors")}
          {renderControlSection("windows")}
          {renderControlSection("seats")}
          {renderControlSection("others")}
          {renderControlSection("lights")}
        </div>
      </div>
    </>
  );
};

export default App;
