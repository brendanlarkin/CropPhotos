const uploadArea = document.getElementById("upload-area");
const fileInput = document.getElementById("file-input");
const fileInputButton = document.getElementById("file-input-button");
const originalImage = document.getElementById("original-image");
const resultImage = document.getElementById("result-image");
const uploadInstructions = document.getElementById("upload-instructions");
const imageUrlInput = document.getElementById("image-url");
const urlSubmitButton = document.getElementById("url-submit");

// Helper function to handle getAsString with a promise
function getAsStringPromise(item) {
  return new Promise((resolve) => {
    item.getAsString((data) => {
      resolve(data);
    });
  });
}

// Helper function to validate URLs
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// Helper function to check if URL points directly to an image
function isDirectImageUrl(url) {
  return url.match(/\.(jpeg|jpg|gif|png|bmp|webp)$/i) != null;
}

// Event listener for the "Choose File" button
fileInputButton.addEventListener("click", () => {
  fileInput.click();
});

// Event listener for file input change
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) {
    displayOriginalImage(file);
    processImageFile(file);
  }
});

// Event listener for paste events
uploadArea.addEventListener("paste", (e) => {
  e.preventDefault();
  uploadArea.innerHTML = ""; // Clear any content inserted into the div

  const items = (e.clipboardData || e.originalEvent.clipboardData).items;

  for (const item of items) {
    if (item.type.indexOf("image") !== -1) {
      const file = item.getAsFile();
      displayOriginalImage(file);
      processImageFile(file);
      break; // Process only the first image
    }
  }
});

// Event listeners for drag and drop
uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("dragover");
});

uploadArea.addEventListener("dragleave", () => {
  uploadArea.classList.remove("dragover");
});

uploadArea.addEventListener("drop", async (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragover");

  console.log("Drop event:", e);
  console.log("DataTransfer object:", e.dataTransfer);
  console.log("DataTransfer items:", e.dataTransfer.items);
  console.log("DataTransfer files:", e.dataTransfer.files);
  console.log("DataTransfer types:", e.dataTransfer.types);

  let fileProcessed = false;

  // Attempt to get files from e.dataTransfer.files
  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    console.log("Files detected in DataTransfer.files");
    const file = files[0];
    console.log("File:", file);
    displayOriginalImage(file);
    processImageFile(file);
    fileProcessed = true;
  } else {
    console.log("No files in DataTransfer.files");
  }

  // If not processed, attempt to get data from e.dataTransfer.items
  if (!fileProcessed) {
    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      console.log("Items detected in DataTransfer.items");

      // First, process text/html items to extract image URLs
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log(`Item ${i}: kind=${item.kind}, type=${item.type}`);

        if (item.kind === "string" && item.type === "text/html") {
          const data = await getAsStringPromise(item);
          console.log(`String data for item ${i} (text/html):`, data);

          // Parse the HTML to extract the image URL
          const parser = new DOMParser();
          const doc = parser.parseFromString(data, "text/html");
          const img = doc.querySelector("img");

          if (img && img.src) {
            const imageUrl = img.src; // Removed encodeURI to prevent double encoding
            console.log("Image URL extracted from HTML:", imageUrl);
            displayOriginalImage(imageUrl);
            processImageUrl(imageUrl);
            fileProcessed = true;
            break; // Stop processing after handling the image URL
          } else {
            console.log("No image found in HTML data");
          }
        }
      }

      // If still not processed, process text/uri-list items
      if (!fileProcessed) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          console.log(`Item ${i}: kind=${item.kind}, type=${item.type}`);

          if (
            item.kind === "string" &&
            (item.type === "text/uri-list" || item.type === "text/plain")
          ) {
            const data = await getAsStringPromise(item);
            console.log(`String data for item ${i} (${item.type}):`, data);

            if (isValidUrl(data) && isDirectImageUrl(data)) {
              console.log("Valid direct image URL detected:", data);
              displayOriginalImage(data);
              processImageUrl(data);
              fileProcessed = true;
              break; // Stop processing after handling the URL
            } else {
              console.log("Invalid URL or not a direct image:", data);
            }
          }
        }
      }
    } else {
      console.log("No items in DataTransfer.items");
    }
  }

  // If still no data processed, inform the user
  if (!fileProcessed) {
    alert(
      "Unable to retrieve image data. Dragging images from some websites may not be supported due to browser security restrictions."
    );
  }
});

// Event listener for the URL submit button
urlSubmitButton.addEventListener("click", () => {
  const url = imageUrlInput.value.trim();
  if (url) {
    if (!isDirectImageUrl(url)) {
      alert(
        "The provided URL does not point directly to an image. Please provide a direct image URL."
      );
      return;
    }
    displayOriginalImage(url);
    processImageUrl(url);
  } else {
    alert("Please enter a valid image URL.");
  }
});

// Function to display the original image
function displayOriginalImage(fileOrUrl) {
  if (typeof fileOrUrl === "string") {
    // It's a URL
    originalImage.src = fileOrUrl;
    originalImage.style.display = "block";
    uploadInstructions.style.display = "none";
  } else {
    // It's a File
    const reader = new FileReader();
    reader.onload = function (e) {
      originalImage.src = e.target.result;
      originalImage.style.display = "block";
      uploadInstructions.style.display = "none";
    };
    reader.readAsDataURL(fileOrUrl);
  }
}

// Function to process image files
function processImageFile(file) {
  showLoadingIndicator();

  const formData = new FormData();
  formData.append("image_file", file);

  fetch("/process", {
    method: "POST",
    body: formData,
  })
    .then(handleResponse)
    .then(displayResultImage)
    .catch(handleError)
    .finally(hideLoadingIndicator);
}

// Function to process image URLs
function processImageUrl(url) {
  console.log("Processing URL:", url);
  showLoadingIndicator();

  const formData = new FormData();
  formData.append("image_url", url);

  fetch("/process", {
    method: "POST",
    body: formData,
  })
    .then(handleResponse)
    .then(displayResultImage)
    .catch(handleError)
    .finally(hideLoadingIndicator);
}

// Function to handle the response from the server
function handleResponse(response) {
  if (!response.ok) {
    return response.text().then((text) => {
      throw new Error(text);
    });
  }
  return response.blob();
}

// Function to display the processed image
function displayResultImage(blob) {
  const url = URL.createObjectURL(blob);
  resultImage.src = url;
  resultImage.style.display = "block";
}

// Function to handle errors
function handleError(error) {
  alert("Error: " + error.message);
  console.error("Error details:", error);
}

// Function to show the loading indicator
function showLoadingIndicator() {
  // Show loading indicator in the result area
  resultImage.style.display = "none";
  if (!document.getElementById("loading-spinner")) {
    resultImage.parentElement.insertAdjacentHTML(
      "beforeend",
      '<div id="loading-spinner" class="spinner"></div>'
    );
  }
}

// Function to hide the loading indicator
function hideLoadingIndicator() {
  // Remove loading indicator
  const spinner = document.getElementById("loading-spinner");
  if (spinner) {
    spinner.remove();
  }
}
