# Changelog - Music Player UI Improvements

## 2026-02-20 - v2.6.5

### Playlist AI + Mobile + Responsive
- Added `Add songs using AI` action in playlist detail so AI can append tracks to an existing playlist.
- Existing playlist tracks are preserved during AI append.
- Duplicate protection added for AI-added tracks (Navidrome ID / URL dedupe).
- Newly AI-added tracks are visually highlighted in playlist detail.

### Thumbnail Peek / Swipe Fixes
- Fixed mobile fullscreen thumbnail-peek direction logic.
- Restored right-swipe track switching when previewing adjacent covers.
- Improved adjacent track preview consistency.

### Mobile Queue Reordering
- Added touch fallback for queue reordering on mobile (long-press + drag).
- Improved drag/drop feedback and drop-target stability in mobile queue modal.

### Small-Screen UI Optimization
- Reworked Home action buttons layout to fit narrow screens.
- Improved playlist action button wrapping/sizing on tablet and phone breakpoints.
- Tuned bottom mobile nav labels so controls fit reliably on small widths.

### Playlist Sidebar UX
- Updated left playlist sector: if playlists are more than 3, show `Show more`.
- `Show more` opens a dedicated full playlists page with all user playlists.
- Home playlists row keeps full playlist visibility.

## Latest Updates

### 1. **Playlist Management UI Modals**
- ✅ **Rename Modal**: Replaced `window.prompt()` with custom UI modal
  - Input field for new playlist name
  - Confirm/Cancel buttons with hover effects
  - Automatic translation support

- ✅ **Delete Confirmation Modal**: Added confirmation dialog before deletion
  - Clear warning message
  - Red delete button to indicate destructive action
  - Cancel option to prevent accidents

### 2. **Add to Playlist Redesign**
- ✅ **Removed Checkboxes**: Replaced checkbox-based selection with interactive buttons
- ✅ **Interactive Buttons**: 
  - Each playlist appears as a clickable pill/card button
  - Shows current selection state (color highlight + icon change)
  - Smooth hover animations (scale, color transition)
  - Visual feedback with check/plus icons
- ✅ **Better UX**: Immediate visual feedback on selection/deselection
- ✅ **Animations**: 
  - Slide animation on button hover
  - Smooth fade-in for button list
  - Scale feedback on click

### 3. **Internationalization (I18N)**
- ✅ **Default Language Changed**: English is now the default language
  - Updated `state.lang` from 'ru' to 'en' in state.js
  - Reordered language selector to show English first
  - All new translations added to I18N object

### 4. **New Functions Added**
- `confirmRenamePlaylist()` - Handle rename submission
- `cancelRenamePlaylist()` - Close rename modal
- `confirmDeletePlaylist()` - Execute playlist deletion
- `cancelDeletePlaylist()` - Close delete modal
- Completely redesigned `openPlaylistPickerMulti()` with new button-based UI

### 5. **Styling Enhancements**
- Added CSS animations for modals (slide-up effect)
- Added fade-in animations for playlist picker buttons
- Hover state animations for better interactivity
- Input field focus styling with accent color glow
- Active state feedback (scale down on click)

### 6. **Data Structures**
- Added global objects:
  - `renameData`: Tracks playlist ID and old name during rename operation
  - `deleteData`: Tracks playlist ID during delete operation

## Files Modified

### `/js/app.js`
- Updated I18N translations with new keys (rename_playlist, confirm, delete, delete_playlist, delete_playlist_confirm, renamed, deleted)
- Replaced `openPlaylistPickerMulti()` with new interactive button-based UI
- Updated `deletePlaylist()` to show modal instead of immediate deletion
- Updated `renamePlaylist()` to show modal instead of using prompt()
- Added 4 new confirmation/cancellation functions

### `/js/state.js`
- Changed default language from 'ru' to 'en'

### `/index.html`
- Added `renamePlaylistModal` with input field and confirm/cancel buttons
- Added `deletePlaylistModal` with warning and delete/cancel buttons
- Reordered language selector (English first, Russian second)

### `/css/main.css`
- Added animations for modal entrance (slideUp)
- Added fade-in animation for playlist picker buttons
- Added hover and focus states for input field
- Added active state scaling for buttons

## User Experience Improvements

✨ **Before:**
- Playlist rename: Browser prompt with Russian text
- Playlist delete: Instant deletion with no confirmation
- Add to Playlist: Ugly checkbox list (sometimes with rendering issues)
- Default language: Russian (confusing for English users)

✨ **After:**
- Playlist rename: Beautiful custom modal with input field
- Playlist delete: Safe confirmation modal with warning
- Add to Playlist: Interactive button grid with visual feedback
- Default language: English with easy language switching
- All interactions have smooth animations
- Consistent design language across all modals

## Technical Details

### Modal Implementation
- Uses existing `toggleModal()` function infrastructure
- Proper state tracking with global `renameData` and `deleteData` objects
- Clean separation between UI presentation and business logic
- Full async/await support for database operations

### Playlist Picker Button Generation
- Dynamically creates buttons for each playlist
- Real-time visual state synchronization
- Immediate database updates on selection change
- Icon switching (plus/check) based on selection state
- Smooth transitions with cubic-bezier easing

### Internationalization
- All new UI text properly translated to Russian and English
- Data attributes (data-t) support for future i18n processing
- Consistent terminology across UI
