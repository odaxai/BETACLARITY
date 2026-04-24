import React, { useState } from "react";
import { motion } from "framer-motion";

const AppleStyleHeader = () => {
  const [activeItem, setActiveItem] = useState(null);
  
  const menuItems = [
    "Problem", 
    "Opportunity", 
    "Value", 
    "Technology", 
    "Advantage", 
    "Contact"
  ];

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1000,
        width: "100%",
        backgroundColor: "#000000",
        borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
        padding: "16px 0",
      }}
    >
      <div style={{
        maxWidth: "1440px",
        margin: "0 auto",
        padding: "0 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        {/* Logo BETACLARITY */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <a href="/" style={{ 
            textDecoration: "none", 
            color: "#ffffff", 
            fontSize: "20px", 
            fontWeight: "600",
            letterSpacing: "0.5px"
          }}>
            BETACLARITY
          </a>
        </motion.div>

        {/* Navigation Menu */}
        <nav>
          <ul style={{
            display: "flex",
            gap: "28px",
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}>
            {menuItems.map((item) => (
              <li key={item}>
                <motion.a
                  href={`/#${item.toLowerCase()}`}
                  onMouseEnter={() => setActiveItem(item)}
                  onMouseLeave={() => setActiveItem(null)}
                  style={{
                    textDecoration: "none",
                    color: "#ffffff",
                    fontSize: "14px",
                    fontWeight: "400",
                    opacity: 0.8,
                    transition: "opacity 0.2s ease",
                    position: "relative",
                    padding: "8px 0",
                  }}
                  whileHover={{ opacity: 1 }}
                >
                  {item}
                  {activeItem === item && (
                    <motion.div
                      layoutId="activeIndicator"
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: "1px",
                        backgroundColor: "#ffffff",
                      }}
                      transition={{ duration: 0.2 }}
                    />
                  )}
                </motion.a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </motion.header>
  );
};

export default AppleStyleHeader; 