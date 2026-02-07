type Product = {
  id: string;
  title: string;
  handle: string;
  description: string;
  descriptionHtml: string;
  tags: string[];
  productType: string;
  vendor: string;
  seo: {
    title: string | null;
    description: string | null;
  };
  featuredImage: {
    url: string;
    altText: string | null;
  } | null;
  images: {
    nodes: Array<{
      url: string;
      altText: string | null;
    }>;
  };
  variants: {
    nodes: Array<{
      price: string;
    }>;
  };
  collections: {
    nodes: Array<{
      id: string;
      title: string;
    }>;
  };
};

type ProductIssues = {
  required: string[]; // Critical missing fields (price, vendor, collections)
  title: string[];
  description: string[];
  tags: string[];
  seo: string[];
  images: string[];
  warnings: string[]; // Warning-level issues (product type, category)
};

type AnalysisResult = {
  optimizationScore: number;
  issuesCount: number;
  issues: ProductIssues;
};

/**
 * Analyze a product's title quality
 * Returns issues found and a score (0-100)
 */
function analyzeTitleQuality(title: string): {
  issues: string[];
  score: number;
} {
  const issues: string[] = [];
  let score = 100;

  // Check title length
  if (title.length < 15) {
    issues.push("Title too short (under 15 characters)");
    score -= 30;
  } else if (title.length < 30) {
    issues.push("Title could be more descriptive (under 30 characters)");
    score -= 15;
  }

  if (title.length > 70) {
    issues.push("Title too long for SEO (over 70 characters)");
    score -= 20;
  }

  // Check for generic words
  const genericTerms = /^(product|item|thing|stuff|untitled)/i;
  if (genericTerms.test(title.trim())) {
    issues.push("Title contains generic placeholder text");
    score -= 40;
  }

  // Check for all caps
  if (title === title.toUpperCase() && title.length > 10) {
    issues.push("Title is all uppercase (poor readability)");
    score -= 10;
  }

  // Check for special characters spam
  const specialCharsCount = (title.match(/[!@#$%^&*()+=\[\]{};:'",<>?]/g) || [])
    .length;
  if (specialCharsCount > 3) {
    issues.push("Too many special characters");
    score -= 10;
  }

  return { issues, score: Math.max(0, score) };
}

/**
 * Analyze a product's description quality
 * Returns issues found and a score (0-100)
 */
function analyzeDescriptionQuality(
  description: string,
  descriptionHtml: string
): {
  issues: string[];
  score: number;
} {
  const issues: string[] = [];
  let score = 100;

  // Check if description exists
  if (!description || description.trim().length === 0) {
    issues.push("No description provided");
    return { issues, score: 0 };
  }

  // Check description length
  if (description.length < 50) {
    issues.push("Description too short (under 50 characters)");
    score -= 40;
  } else if (description.length < 100) {
    issues.push("Description could be more detailed (under 100 characters)");
    score -= 20;
  }

  // Ideal range: 150-300 words
  const wordCount = description.trim().split(/\s+/).length;
  if (wordCount < 30) {
    issues.push("Description has too few words (under 30 words)");
    score -= 20;
  } else if (wordCount > 300) {
    issues.push("Description may be too long (over 300 words)");
    score -= 10;
  }

  // Check for HTML formatting
  const hasHtmlFormatting =
    descriptionHtml.includes("<p>") ||
    descriptionHtml.includes("<ul>") ||
    descriptionHtml.includes("<ol>");
  if (!hasHtmlFormatting && description.length > 100) {
    issues.push("Description lacks HTML formatting (plain text only)");
    score -= 10;
  }

  return { issues, score: Math.max(0, score) };
}

/**
 * Analyze a product's tags quality
 * Returns issues found and a score (0-100)
 */
function analyzeTagsQuality(tags: string[]): {
  issues: string[];
  score: number;
} {
  const issues: string[] = [];
  let score = 100;

  // Check if tags exist
  if (!tags || tags.length === 0) {
    issues.push("No tags provided");
    return { issues, score: 0 };
  }

  // Check tag count
  if (tags.length < 3) {
    issues.push("Too few tags (under 3)");
    score -= 30;
  } else if (tags.length < 5) {
    issues.push("Could use more tags (under 5)");
    score -= 15;
  }

  if (tags.length > 20) {
    issues.push("Too many tags (over 20, may dilute relevance)");
    score -= 10;
  }

  // Check for overly generic tags
  const genericTags = tags.filter((tag) =>
    /^(product|item|new|sale|best|top|popular)$/i.test(tag.trim())
  );
  if (genericTags.length > 0) {
    issues.push(`Generic tags found: ${genericTags.join(", ")}`);
    score -= 10;
  }

  // Check for inconsistent formatting
  const hasUpperCase = tags.some((tag) => tag !== tag.toLowerCase());
  const hasSpaces = tags.some((tag) => tag.includes(" ") && !tag.includes("-"));
  if (hasUpperCase) {
    issues.push("Inconsistent tag capitalization (use lowercase)");
    score -= 5;
  }
  if (hasSpaces) {
    issues.push("Tags with spaces (consider using hyphens)");
    score -= 5;
  }

  return { issues, score: Math.max(0, score) };
}

/**
 * Analyze a product's SEO metadata quality
 * Returns issues found and a score (0-100)
 */
function analyzeSEOQuality(
  seo: { title: string | null; description: string | null },
  productTitle: string
): {
  issues: string[];
  score: number;
} {
  const issues: string[] = [];
  let score = 100;

  // Check SEO title
  if (!seo.title || seo.title.trim().length === 0) {
    issues.push("No SEO title set (using product title by default)");
    score -= 20;
  } else {
    if (seo.title.length < 30) {
      issues.push("SEO title too short (under 30 characters)");
      score -= 15;
    } else if (seo.title.length > 60) {
      issues.push("SEO title too long (over 60 characters, may be cut off)");
      score -= 15;
    }

    // Check if SEO title is same as product title
    if (seo.title === productTitle) {
      issues.push("SEO title same as product title (could be optimized)");
      score -= 10;
    }
  }

  // Check SEO description
  if (!seo.description || seo.description.trim().length === 0) {
    issues.push("No SEO description set");
    score -= 30;
  } else {
    if (seo.description.length < 50) {
      issues.push("SEO description too short (under 50 characters)");
      score -= 20;
    } else if (seo.description.length < 120) {
      issues.push("SEO description could be longer (under 120 characters)");
      score -= 10;
    } else if (seo.description.length > 160) {
      issues.push(
        "SEO description too long (over 160 characters, may be cut off)"
      );
      score -= 15;
    }
  }

  return { issues, score: Math.max(0, score) };
}

/**
 * Analyze a product's image quality
 * Returns issues found and a score (0-100)
 */
function analyzeImageQuality(product: Product): {
  issues: string[];
  score: number;
} {
  const issues: string[] = [];
  let score = 100;

  // Check if product has images
  if (!product.featuredImage && product.images.nodes.length === 0) {
    issues.push("No product images");
    return { issues, score: 0 };
  }

  // Check for featured image
  if (!product.featuredImage) {
    issues.push("No featured image set");
    score -= 30;
  }

  // Check image count
  const imageCount = product.images.nodes.length;
  if (imageCount < 2) {
    issues.push("Only 1 image (recommend at least 3-5 images)");
    score -= 20;
  } else if (imageCount < 3) {
    issues.push("Could use more images (recommend 3-5 images)");
    score -= 10;
  }

  // Check for alt text
  const imagesWithoutAlt = product.images.nodes.filter(
    (img) => !img.altText || img.altText.trim().length === 0
  );
  if (imagesWithoutAlt.length > 0) {
    issues.push(
      `${imagesWithoutAlt.length} image(s) missing alt text (important for SEO & accessibility)`
    );
    score -= 15 * Math.min(imagesWithoutAlt.length / imageCount, 1);
  }

  return { issues, score: Math.max(0, score) };
}

/**
 * Check for missing required fields (critical issues)
 * Based on native-path v2 validation requirements
 */
function checkRequiredFields(product: Product): {
  issues: string[];
  score: number;
} {
  const issues: string[] = [];
  let score = 100;

  // Check vendor (required)
  if (!product.vendor || product.vendor.trim().length === 0) {
    issues.push("Missing vendor/manufacturer");
    score -= 20;
  }

  // Check price from variants (required)
  const hasValidPrice = product.variants?.nodes?.some(
    (variant) => variant.price && parseFloat(variant.price) > 0
  );
  if (!hasValidPrice) {
    issues.push("Missing price or price is $0");
    score -= 20;
  }

  // Check collections (required - must have at least one)
  const hasCollections = product.collections?.nodes && product.collections.nodes.length > 0;
  if (!hasCollections) {
    issues.push("Not in any collections");
    score -= 20;
  }

  return { issues, score };
}

/**
 * Check for warning-level missing fields (important but not critical)
 */
function checkWarningFields(product: Product): string[] {
  const warnings: string[] = [];

  // Check product type (warning level)
  if (!product.productType || product.productType.trim().length === 0) {
    warnings.push("Missing product type (recommended for categorization)");
  }

  // Note: Category check would require fetching category data
  // which is not currently in the Product type

  return warnings;
}

/**
 * Analyze a product and calculate optimization score
 * Weighted scoring: required(40%), title(20%), description(20%), tags(10%), SEO(5%), images(5%)
 * Updated weights to prioritize required fields
 */
export function analyzeProduct(product: Product): AnalysisResult {
  // Check required fields first (critical)
  const requiredAnalysis = checkRequiredFields(product);
  const warnings = checkWarningFields(product);

  // Run quality checks on other fields
  const titleAnalysis = analyzeTitleQuality(product.title);
  const descriptionAnalysis = analyzeDescriptionQuality(
    product.description,
    product.descriptionHtml
  );
  const tagsAnalysis = analyzeTagsQuality(product.tags);
  const seoAnalysis = analyzeSEOQuality(product.seo, product.title);
  const imageAnalysis = analyzeImageQuality(product);

  // Combine all issues
  const issues: ProductIssues = {
    required: requiredAnalysis.issues,
    title: titleAnalysis.issues,
    description: descriptionAnalysis.issues,
    tags: tagsAnalysis.issues,
    seo: seoAnalysis.issues,
    images: imageAnalysis.issues,
    warnings: warnings,
  };

  const issuesCount =
    requiredAnalysis.issues.length +
    titleAnalysis.issues.length +
    descriptionAnalysis.issues.length +
    tagsAnalysis.issues.length +
    seoAnalysis.issues.length +
    imageAnalysis.issues.length +
    warnings.length;

  // Calculate weighted optimization score
  // Required fields have highest weight (40%) to ensure critical issues are prioritized
  const optimizationScore = Math.round(
    requiredAnalysis.score * 0.4 +
      titleAnalysis.score * 0.2 +
      descriptionAnalysis.score * 0.2 +
      tagsAnalysis.score * 0.1 +
      seoAnalysis.score * 0.05 +
      imageAnalysis.score * 0.05
  );

  return {
    optimizationScore,
    issuesCount,
    issues,
  };
}

/**
 * Calculate optimization score from issues (used when issues are already stored)
 */
export function calculateOptimizationScore(issues: ProductIssues): number {
  // Reconstruct scores from issue counts (approximate)
  // Required issues reduce score by 20 points each
  const requiredScore = Math.max(0, 100 - issues.required.length * 20);
  const titleScore = Math.max(0, 100 - issues.title.length * 15);
  const descriptionScore = Math.max(0, 100 - issues.description.length * 15);
  const tagsScore = Math.max(0, 100 - issues.tags.length * 15);
  const seoScore = Math.max(0, 100 - issues.seo.length * 15);
  const imageScore = Math.max(0, 100 - issues.images.length * 15);

  return Math.round(
    requiredScore * 0.4 +
      titleScore * 0.2 +
      descriptionScore * 0.2 +
      tagsScore * 0.1 +
      seoScore * 0.05 +
      imageScore * 0.05
  );
}
