import styles from '../../styles/Home.module.css';

export default function BackgroundShapes() {
    return (
        <div className={styles.shapesContainer}>
            {/* Floating Form Element 1: Input Box */}
            <div className={`${styles.shape} ${styles.shape1}`}>
                <div className={styles.shapeInputLine} />
                <div className={styles.shapeInputLineShort} />
            </div>

            {/* Floating Form Element 2: Checkbox */}
            <div className={`${styles.shape} ${styles.shape2}`}>
                <div className={styles.shapeCheckbox} />
                <div className={styles.shapeInputLineShort} />
            </div>

            {/* Floating Form Element 3: Mail/Envelope */}
            <div className={`${styles.shape} ${styles.shape3}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.shapeMailIcon}>
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                </svg>
            </div>

            {/* Floating Form Element 4: Toggle Switch */}
            <div className={`${styles.shape} ${styles.shape4}`}>
                <div className={styles.shapeToggleTrack}>
                    <div className={styles.shapeToggleThumb} />
                </div>
            </div>

            {/* Floating Form Element 5: Progress Bar */}
            <div className={`${styles.shape} ${styles.shape5}`}>
                <div className={styles.shapeProgressBg}>
                    <div className={styles.shapeProgressFill} />
                </div>
            </div>

            {/* Floating Form Element 6: Form Header */}
            <div className={`${styles.shape} ${styles.shape6}`}>
                <div className={styles.shapeHeaderCircle} />
                <div className={styles.shapeInputLine} />
            </div>
        </div>
    );
}
