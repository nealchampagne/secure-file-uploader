const createFolder = async (parentId = null) => {
  try {
    document.querySelector('.fab-container')?.classList.remove('active');
    const res = await fetch('/folders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId })
    });

    if (!res.ok) {
      throw new Error(`Server error: ${res.status} ${text}`);
    }

    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Expected JSON but got something else');
    }
    const folder = await res.json();
    console.log('Parsed folder:', folder);

    const folderList = document.getElementById('folder-list');
    if (!folderList) throw new Error('folder-list element not found');

    const newItem = document.createElement('li');
    newItem.className = 'folder card';
    newItem.dataset.id = folder.id;
    newItem.dataset.type = 'folder';
    newItem.setAttribute('ondragover', 'event.preventDefault()');
    newItem.setAttribute('ondrop', 'handleDrop(event)');

    newItem.innerHTML = `
      <a href="/folders/${folder.id}" class="card-link">
        <div class="card-icon">📁</div>
        <span class="card-title rename-target"
              draggable="true" data-id="${folder.id}" data-type="folder">
          ${folder.name}
        </span>
      </a>
      <button class="kebab-menu"
              aria-label="More options"
              data-id="${folder.id}"
              data-type="folder"
              tabindex="0">⋮</button>
    `;


    folderList.appendChild(newItem);

    // Make the folder a valid drop target
    newItem.addEventListener('dragover', (e) => {
      e.preventDefault();
      newItem.classList.add('drag-hover');
    });
    newItem.addEventListener('dragleave', () => {
      newItem.classList.remove('drag-hover');
    });
    newItem.addEventListener('drop', handleDrop);

    // Make the folder draggable
    const draggableEl = newItem.querySelector('[draggable="true"]');
    if (draggableEl) {
      draggableEl.addEventListener('dragstart', (e) => {
        const target = e.target;
        draggedItem = {
          id: target.dataset.id,
          type: target.dataset.type
        };
      });
    }

  } catch (err) {
    console.error('Error creating folder:', err);
    alert('Could not create folder.');
  }
};