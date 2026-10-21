export const MAX_IMAGE_DIMENSION = 8192;
export const MAX_IMAGE_PIXELS = 40_000_000;

export function validateImageDimensions(width, height) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return {
      valid: false,
      message: "Could not verify the selected image's dimensions."
    };
  }

  if (
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    return {
      valid: false,
      message: `Selected image is too large. Maximum size is ${MAX_IMAGE_DIMENSION} pixels per side and ${MAX_IMAGE_PIXELS / 1_000_000} megapixels.`
    };
  }

  return { valid: true };
}
