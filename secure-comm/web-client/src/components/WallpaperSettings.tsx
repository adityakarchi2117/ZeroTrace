'use client';

import React, { useState, useRef, ChangeEvent } from 'react';
import { motion } from 'framer-motion';
import {
  useAppearance,
  presetWallpapers,
  type WallpaperSettings as WallpaperSettingsType,
  saveCustomWallpaper,
  loadCustomWallpaper,
  deleteCustomWallpaper,
} from '@/lib/useAppearance';
import {
  Image,
  Upload,
  X,
  Sliders,
  Grid,
  Palette,
  Link,
  Check,
  Trash2,
} from 'lucide-react';

export function WallpaperSettings() {
  const { settings, updateWallpaper } = useAppearance();
  const { wallpaper } = settings;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Handle preset selection
  const handlePresetSelect = (presetId: string) => {
    updateWallpaper({
      type: 'preset',
      value: presetId,
      enabled: presetId !== 'none',
    });
  };

  // Handle file upload
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  // Process uploaded file
  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      if (base64) {
        saveCustomWallpaper(base64);
        updateWallpaper({
          type: 'custom',
          value: base64,
          enabled: true,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  // Handle URL submit
  const handleUrlSubmit = () => {
    if (!urlInput.trim()) return;
    updateWallpaper({
      type: 'url',
      value: urlInput.trim(),
      enabled: true,
    });
    setShowUrlInput(false);
    setUrlInput('');
  };

  // Handle remove wallpaper
  const handleRemove = () => {
    deleteCustomWallpaper();
    updateWallpaper({
      enabled: false,
      type: 'preset',
      value: 'none',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-gray-800">
        <div className="p-2 bg-cyan-500/20 rounded-lg">
          <Image className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Chat Wallpaper</h3>
          <p className="text-sm text-gray-400">Customize your chat background</p>
        </div>
      </div>

      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl">
        <span className="text-white">Enable Wallpaper</span>
        <button
          onClick={() => updateWallpaper({ enabled: !wallpaper.enabled })}
          className={`relative w-14 h-7 rounded-full transition-colors ${
            wallpaper.enabled ? 'bg-cyan-500' : 'bg-gray-600'
          }`}
        >
          <motion.div
            animate={{ x: wallpaper.enabled ? 28 : 4 }}
            className="absolute top-1 w-5 h-5 bg-white rounded-full"
          />
        </button>
      </div>

      {wallpaper.enabled && (
        <>
          {/* Preset Wallpapers */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-300">Presets</span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
              {presetWallpapers.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetSelect(preset.id)}
                  className={`group relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                    wallpaper.type === 'preset' && wallpaper.value === preset.id
                      ? 'border-cyan-500 ring-2 ring-cyan-500/30'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                  title={preset.name}
                >
                  {preset.id === 'none' ? (
                    <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                      <X className="w-6 h-6 text-gray-500" />
                    </div>
                  ) : preset.id === 'dots' || preset.id === 'grid' ? (
                    <div
                      className="w-full h-full bg-gray-900"
                      style={{ backgroundImage: preset.value, backgroundSize: preset.id === 'dots' ? '20px 20px' : '40px 40px' }}
                    />
                  ) : (
                    <div
                      className="w-full h-full"
                      style={{ background: preset.value }}
                    />
                  )}
                  
                  {/* Selection indicator */}
                  {wallpaper.type === 'preset' && wallpaper.value === preset.id && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="w-6 h-6 bg-cyan-500 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  )}
                  
                  {/* Name tooltip */}
                  <div className="absolute bottom-0 left-0 right-0 py-1 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] text-white text-center block truncate px-1">
                      {preset.name}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Upload */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-300">Custom Image</span>
            </div>
            
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-cyan-500 bg-cyan-500/10'
                  : 'border-gray-700 hover:border-gray-600 bg-gray-800/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              
              {wallpaper.type === 'custom' ? (
                <div className="relative">
                  <img
                    src={wallpaper.value}
                    alt="Custom wallpaper"
                    className="w-full h-24 object-cover rounded-lg"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove();
                    }}
                    className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full hover:bg-red-600"
                  >
                    <Trash2 className="w-3 h-3 text-white" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">
                    Click or drag image here
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Max 5MB
                  </p>
                </>
              )}
            </div>
          </div>

          {/* URL Input */}
          <div className="space-y-3">
            <button
              onClick={() => setShowUrlInput(!showUrlInput)}
              className="flex items-center gap-2 text-sm text-gray-300 hover:text-white"
            >
              <Link className="w-4 h-4" />
              <span>Image URL</span>
            </button>
            
            {showUrlInput && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="flex gap-2"
              >
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={handleUrlSubmit}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 rounded-lg text-white text-sm font-medium"
                >
                  Apply
                </button>
              </motion.div>
            )}
          </div>

          {/* Opacity & Blur Controls */}
          <div className="space-y-4 pt-4 border-t border-gray-800">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-300">Adjustments</span>
            </div>
            
            {/* Opacity */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Opacity</span>
                <span className="text-white">{wallpaper.opacity}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                value={wallpaper.opacity}
                onChange={(e) => updateWallpaper({ opacity: Number(e.target.value) })}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
            
            {/* Blur */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Blur</span>
                <span className="text-white">{wallpaper.blur}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                value={wallpaper.blur}
                onChange={(e) => updateWallpaper({ blur: Number(e.target.value) })}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>
          </div>

          {/* Preview */}
          <div className="pt-4 border-t border-gray-800">
            <div className="flex items-center gap-2 mb-3">
              <Grid className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-300">Preview</span>
            </div>
            <div className="relative h-32 rounded-xl overflow-hidden bg-gray-800">
              {wallpaper.enabled && (
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: getWallpaperCSSValue(wallpaper),
                    backgroundSize: wallpaper.type === 'custom' || wallpaper.type === 'url' ? 'cover' : 'initial',
                    backgroundPosition: 'center',
                    backgroundRepeat: wallpaper.type === 'custom' || wallpaper.type === 'url' ? 'no-repeat' : 'initial',
                    opacity: wallpaper.opacity / 100,
                    filter: `blur(${wallpaper.blur}px)`,
                  }}
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="max-w-[80%] space-y-2">
                  <div className="h-3 w-24 bg-gray-600 rounded-full" />
                  <div className="h-3 w-32 bg-gray-700 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Helper function to get CSS value
function getWallpaperCSSValue(wallpaper: WallpaperSettingsType): string {
  if (!wallpaper.enabled) return 'none';
  
  if (wallpaper.type === 'preset') {
    const preset = presetWallpapers.find(p => p.id === wallpaper.value);
    if (preset && preset.id !== 'none' && 'value' in preset) {
      return preset.value as string;
    }
    return 'none';
  }
  
  if (wallpaper.type === 'custom' || wallpaper.type === 'url') {
    return `url(${wallpaper.value})`;
  }
  
  return 'none';
}

export default WallpaperSettings;
