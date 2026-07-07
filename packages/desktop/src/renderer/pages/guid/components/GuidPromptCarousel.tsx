/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import type { GuidPromptCategory } from '../utils/guidDefaultPromptKeys';
import styles from './GuidPromptCarousel.module.css';

const AUTO_PLAY_INTERVAL_MS = 2500;

type GuidPromptCarouselProps = {
  categories: GuidPromptCategory[];
  onSelect: (prompt: string) => void;
  showTitle?: boolean;
  showIndicators?: boolean;
};

const GuidPromptCarousel: React.FC<GuidPromptCarouselProps> = ({ categories, onSelect, showTitle = false, showIndicators = false }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);
  const activeCategory = categories[activeIndex] ?? categories[0];

  const goToCategory = useCallback(
    (index: number) => {
      if (categories.length === 0) return;
      setActiveIndex((index + categories.length) % categories.length);
      setAnimationKey((prev) => prev + 1);
    },
    [categories.length]
  );

  useEffect(() => {
    setActiveIndex(0);
    setAnimationKey((prev) => prev + 1);
  }, [categories]);

  useEffect(() => {
    if (categories.length <= 1 || isPaused) return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % categories.length);
      setAnimationKey((current) => current + 1);
    }, AUTO_PLAY_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [categories.length, isPaused]);

  if (!activeCategory) return null;

  return (
    <div
      data-testid='guid-prompt-carousel'
      className={styles.carousel}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div key={animationKey} className={`${styles.categoryPanel} ${styles.categoryPanelEnter}`}>
        {activeCategory.title && showTitle ? (
          <div className={styles.categoryTitle} data-testid='guid-prompt-carousel-category-title'>
            {activeCategory.title}
          </div>
        ) : null}
        <div className={styles.promptList}>
          {activeCategory.prompts.map((prompt, index) => (
            <Button
              key={`${activeIndex}-${index}-${prompt}`}
              type='text'
              className='!h-auto !w-full !rounded-10px !border !border-border-2 !bg-bg-base !px-10px !py-10px !text-left !text-12.5px !text-t-secondary !whitespace-normal !break-words transition-colors hover:!border-aou-6 hover:!text-t-primary'
              onClick={() => onSelect(prompt)}
            >
              {prompt}
            </Button>
          ))}
        </div>
      </div>

      {categories.length > 1 && showIndicators ? (
        <div className={styles.indicators} data-testid='guid-prompt-carousel-indicators'>
          {categories.map((category, categoryIndex) => (
            <button
              key={category.title ?? `category-${categoryIndex}`}
              type='button'
              aria-label={`Category ${categoryIndex + 1}`}
              className={`${styles.indicator} ${categoryIndex === activeIndex ? styles.indicatorActive : ''}`}
              onClick={() => goToCategory(categoryIndex)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default GuidPromptCarousel;
