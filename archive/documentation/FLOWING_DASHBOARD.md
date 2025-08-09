# AutoLlama Flowing Dashboard

## Overview
Implemented a mempool.space-inspired flowing visualization dashboard that displays AutoLlama's document processing pipeline as animated flowing objects across the screen.

## Features Implemented

### 🌊 Core Flowing Visualization
- **Canvas-based Animation**: Smooth 60fps animations using HTML5 Canvas
- **Real-time Data Integration**: Connected to existing SSE system for live updates
- **Multiple Object Types**:
  - 📄 **Documents**: Large flowing rectangles representing processed documents
  - ⚡ **Processing Events**: Medium objects showing active processing
  - ✂️ **Chunk Batches**: Small objects representing chunk collections

### 🎨 Visual Design
- **Status-based Coloring**:
  - 🟢 Green: Completed documents/chunks
  - 🟡 Amber: Currently processing
  - 🔴 Red: Failed processing
  - 🔵 Blue: Queued items
- **Dynamic Sizing**: Object size reflects document length/complexity
- **Multi-lane Flow**: Objects flow in multiple horizontal lanes
- **Physics-based Animation**: Speed and opacity variations for visual interest

### 🎮 Interactive Features
- **Hover Tooltips**: Detailed information on mouse hover
- **Click Navigation**: Click documents to open document viewer
- **Playback Controls**: Play/pause animation
- **Speed Control**: Adjust flow speed from 0.1x to 3x
- **Density Control**: Adjust visual density from 10% to 100%
- **Legend & Stats**: Real-time system statistics overlay

### 📡 Real-time Integration
- **SSE Updates**: Automatic updates from `/api/stream` endpoint
- **System Stats**: Live total documents, chunks, and processing counts
- **Processing Events**: New processing events appear as flowing objects
- **Cache Integration**: Optimized to work with existing API cache system

## Technical Implementation

### Components
- **FlowingDashboard.jsx**: Main component with Canvas animation loop
- **Dashboard Integration**: Added as "Flow View" tab in main dashboard
- **Performance Optimized**: Uses `requestAnimationFrame` for smooth animation

### Data Sources
- **System Stats**: `systemStats.knowledgeBase` for document/chunk counts
- **Documents Array**: Recent documents displayed as flowing objects
- **Processing Queue**: Active processing sessions shown as events
- **SSE Stream**: Real-time updates for new activity

### Animation System
- **Canvas Rendering**: Custom drawing functions with rounded rectangles
- **Object Management**: Array-based object tracking with position updates
- **Visual Effects**: Shadows, pulses, and glow effects for different object types
- **Responsive Design**: Canvas auto-sizes to container dimensions

## Usage Instructions

### Accessing Flow View
1. Navigate to the AutoLlama dashboard at http://localhost:8080
2. Click the "Flow View" tab (🌊 icon) in the dashboard navigation
3. Observe documents flowing from left to right across the screen

### Controls
- **Play/Pause**: ⏯️ button to start/stop animation
- **Settings**: ⚙️ button to access speed and density controls
- **Hover**: Mouse over any flowing object for details
- **Click**: Click document objects to view full document details

### Interpreting the Flow
- **Document Flow**: Large rectangles moving left-to-right
- **Processing Activity**: Medium objects with pulsing effects
- **Chunk Batches**: Small fast-moving squares
- **Speed**: Faster movement = higher system activity
- **Color**: Status-based coloring shows processing state

## Future Enhancements

### Potential Improvements
1. **WebGL Rendering**: Upgrade to WebGL for handling 1000+ objects
2. **Historical Playback**: Replay processing history over time
3. **Filter Controls**: Filter by document type, date, status
4. **Performance Analytics**: Visual bottleneck identification
5. **Mobile Optimization**: Touch interactions for mobile devices
6. **Sound Effects**: Audio feedback for processing events

### API Extensions
1. `/api/flow-stream`: Dedicated endpoint for flow data
2. Enhanced SSE events with more granular object data
3. Historical data endpoints for playback features

## Performance Notes
- **Target**: 60fps with 50+ concurrent objects
- **Memory**: Efficient object recycling to prevent memory leaks
- **CPU**: Optimized canvas operations with minimal redraws
- **Network**: Leverages existing SSE connection for updates

The flowing dashboard transforms AutoLlama's static metrics into an engaging, living visualization that makes system activity immediately apparent and visually compelling.