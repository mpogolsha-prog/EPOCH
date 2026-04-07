/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/epoch_lending.json`.
 */
export type EpochLending = {
  "address": "6UR3o2WprrTuvWU1sXywtTixcAJCRsKt1W9Eeg7gYLwk",
  "metadata": {
    "name": "epochLending",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Open-source fixed-rate lending orderbook on Solana"
  },
  "instructions": [
    {
      "name": "createMarket",
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "termDays"
              },
              {
                "kind": "account",
                "path": "collateralMint"
              }
            ]
          }
        },
        {
          "name": "collateralMint",
          "docs": [
            "Collateral token mint (wSOL for MVP)"
          ]
        },
        {
          "name": "usdcMint",
          "docs": [
            "Lending token mint (USDC)"
          ]
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "termDays",
          "type": "u16"
        },
        {
          "name": "collateralRatioBps",
          "type": "u16"
        },
        {
          "name": "liquidationThresholdBps",
          "type": "u16"
        },
        {
          "name": "protocolFeeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "liquidate",
      "discriminator": [
        223,
        179,
        226,
        125,
        48,
        46,
        39,
        74
      ],
      "accounts": [
        {
          "name": "loan",
          "writable": true
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "collateralVault",
          "writable": true
        },
        {
          "name": "liquidatorCollateralAccount",
          "writable": true
        },
        {
          "name": "priceUpdate",
          "docs": [
            "Pyth price feed account for SOL/USD"
          ]
        },
        {
          "name": "liquidator",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "matchOrders",
      "discriminator": [
        17,
        1,
        201,
        93,
        7,
        51,
        251,
        134
      ],
      "accounts": [
        {
          "name": "loan",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  97,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "market.next_loan_id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "lendOrder",
          "writable": true
        },
        {
          "name": "borrowOrder",
          "writable": true
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "vaultUsdcAccount",
          "writable": true
        },
        {
          "name": "borrowerUsdcAccount",
          "writable": true
        },
        {
          "name": "matcher",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "mockLiquidate",
      "docs": [
        "Mock liquidation for localnet testing — bypasses Pyth oracle,",
        "accepts a manual SOL price in USDC 6-decimal units."
      ],
      "discriminator": [
        71,
        119,
        71,
        149,
        56,
        182,
        76,
        65
      ],
      "accounts": [
        {
          "name": "loan",
          "writable": true
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "collateralVault",
          "writable": true
        },
        {
          "name": "liquidatorCollateralAccount",
          "writable": true
        },
        {
          "name": "liquidator",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "solPriceUsdc",
          "type": "u64"
        }
      ]
    },
    {
      "name": "placeBorrowOrder",
      "discriminator": [
        247,
        53,
        135,
        56,
        230,
        46,
        56,
        226
      ],
      "accounts": [
        {
          "name": "borrowOrder",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  114,
                  114,
                  111,
                  119,
                  95,
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "borrower"
              },
              {
                "kind": "account",
                "path": "market.next_order_id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "collateralVault",
          "writable": true
        },
        {
          "name": "borrowerWsolAccount",
          "writable": true
        },
        {
          "name": "borrower",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "maxRateBps",
          "type": "u16"
        },
        {
          "name": "collateralAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "placeLendOrder",
      "discriminator": [
        45,
        235,
        128,
        2,
        250,
        211,
        249,
        66
      ],
      "accounts": [
        {
          "name": "lendOrder",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  101,
                  110,
                  100,
                  95,
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "lender"
              },
              {
                "kind": "account",
                "path": "market.next_order_id",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "lenderUsdcAccount",
          "writable": true
        },
        {
          "name": "vaultUsdcAccount",
          "writable": true
        },
        {
          "name": "lender",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "minRateBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "repayLoan",
      "discriminator": [
        224,
        93,
        144,
        77,
        61,
        17,
        137,
        54
      ],
      "accounts": [
        {
          "name": "loan",
          "writable": true
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "borrowerUsdcAccount",
          "writable": true
        },
        {
          "name": "lenderUsdcAccount",
          "writable": true
        },
        {
          "name": "treasuryUsdcAccount",
          "writable": true
        },
        {
          "name": "collateralVault",
          "writable": true
        },
        {
          "name": "borrowerWsolAccount",
          "writable": true
        },
        {
          "name": "borrower",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "borrowOrder",
      "discriminator": [
        42,
        155,
        26,
        16,
        5,
        172,
        213,
        173
      ]
    },
    {
      "name": "lendOrder",
      "discriminator": [
        81,
        43,
        9,
        95,
        239,
        151,
        195,
        173
      ]
    },
    {
      "name": "loan",
      "discriminator": [
        20,
        195,
        70,
        117,
        165,
        227,
        182,
        1
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "priceUpdateV2",
      "discriminator": [
        34,
        241,
        35,
        99,
        157,
        126,
        244,
        205
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidTerm",
      "msg": "Invalid term: must be 7, 14, or 30 days"
    },
    {
      "code": 6001,
      "name": "invalidRate",
      "msg": "Invalid rate: must be greater than 0"
    },
    {
      "code": 6002,
      "name": "invalidAmount",
      "msg": "Invalid amount: must be greater than 0"
    },
    {
      "code": 6003,
      "name": "insufficientCollateral",
      "msg": "Insufficient collateral: does not meet required ratio"
    },
    {
      "code": 6004,
      "name": "ordersDoNotMatch",
      "msg": "Orders cannot be matched: lend min rate exceeds borrow max rate"
    },
    {
      "code": 6005,
      "name": "orderNotOpen",
      "msg": "Order is not open"
    },
    {
      "code": 6006,
      "name": "loanNotActive",
      "msg": "Loan is not active"
    },
    {
      "code": 6007,
      "name": "loanNotMatured",
      "msg": "Loan has not matured yet"
    },
    {
      "code": 6008,
      "name": "notLiquidatable",
      "msg": "Loan is not eligible for liquidation: collateral ratio above threshold"
    },
    {
      "code": 6009,
      "name": "stalePriceOracle",
      "msg": "Oracle price is stale: exceeds maximum age"
    },
    {
      "code": 6010,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6011,
      "name": "unauthorized",
      "msg": "Unauthorized: signer does not match expected authority"
    },
    {
      "code": 6012,
      "name": "termMismatch",
      "msg": "Market term mismatch between orders"
    },
    {
      "code": 6013,
      "name": "marketMismatch",
      "msg": "Market mismatch between orders"
    }
  ],
  "types": [
    {
      "name": "borrowOrder",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "docs": [
              "Market this order belongs to"
            ],
            "type": "pubkey"
          },
          {
            "name": "owner",
            "docs": [
              "Owner (borrower) of this order"
            ],
            "type": "pubkey"
          },
          {
            "name": "amount",
            "docs": [
              "USDC amount to borrow (in token base units, 6 decimals)"
            ],
            "type": "u64"
          },
          {
            "name": "maxRateBps",
            "docs": [
              "Maximum acceptable APY rate in basis points (e.g., 850 = 8.5%)"
            ],
            "type": "u16"
          },
          {
            "name": "collateralAmount",
            "docs": [
              "SOL collateral deposited (in lamports)"
            ],
            "type": "u64"
          },
          {
            "name": "status",
            "docs": [
              "Order status"
            ],
            "type": {
              "defined": {
                "name": "orderStatus"
              }
            }
          },
          {
            "name": "orderId",
            "docs": [
              "Sequential order ID within the market"
            ],
            "type": "u64"
          },
          {
            "name": "createdAt",
            "docs": [
              "Unix timestamp when order was created"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "lendOrder",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "docs": [
              "Market this order belongs to"
            ],
            "type": "pubkey"
          },
          {
            "name": "owner",
            "docs": [
              "Owner (lender) of this order"
            ],
            "type": "pubkey"
          },
          {
            "name": "amount",
            "docs": [
              "USDC amount to lend (in token base units, 6 decimals)"
            ],
            "type": "u64"
          },
          {
            "name": "minRateBps",
            "docs": [
              "Minimum acceptable APY rate in basis points (e.g., 800 = 8.0%)"
            ],
            "type": "u16"
          },
          {
            "name": "status",
            "docs": [
              "Order status"
            ],
            "type": {
              "defined": {
                "name": "orderStatus"
              }
            }
          },
          {
            "name": "orderId",
            "docs": [
              "Sequential order ID within the market"
            ],
            "type": "u64"
          },
          {
            "name": "createdAt",
            "docs": [
              "Unix timestamp when order was created"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "loan",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "docs": [
              "Market this loan belongs to"
            ],
            "type": "pubkey"
          },
          {
            "name": "lender",
            "docs": [
              "Lender address"
            ],
            "type": "pubkey"
          },
          {
            "name": "borrower",
            "docs": [
              "Borrower address"
            ],
            "type": "pubkey"
          },
          {
            "name": "lendOrder",
            "docs": [
              "Original lend order PDA"
            ],
            "type": "pubkey"
          },
          {
            "name": "borrowOrder",
            "docs": [
              "Original borrow order PDA"
            ],
            "type": "pubkey"
          },
          {
            "name": "principal",
            "docs": [
              "USDC principal amount (in token base units, 6 decimals)"
            ],
            "type": "u64"
          },
          {
            "name": "rateBps",
            "docs": [
              "Fixed APY rate in basis points (e.g., 800 = 8.0%)"
            ],
            "type": "u16"
          },
          {
            "name": "termDays",
            "docs": [
              "Term length in days"
            ],
            "type": "u16"
          },
          {
            "name": "collateralAmount",
            "docs": [
              "SOL collateral locked (in lamports)"
            ],
            "type": "u64"
          },
          {
            "name": "startTime",
            "docs": [
              "Unix timestamp when loan was created (maturity = start_time + term_days * 86400)"
            ],
            "type": "i64"
          },
          {
            "name": "maturity",
            "docs": [
              "Unix timestamp of maturity"
            ],
            "type": "i64"
          },
          {
            "name": "status",
            "docs": [
              "Loan status"
            ],
            "type": {
              "defined": {
                "name": "loanStatus"
              }
            }
          },
          {
            "name": "loanId",
            "docs": [
              "Sequential loan ID within the market"
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "loanStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "repaid"
          },
          {
            "name": "liquidated"
          }
        ]
      }
    },
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "termDays",
            "docs": [
              "Term length in days (7, 14, or 30)"
            ],
            "type": "u16"
          },
          {
            "name": "collateralMint",
            "docs": [
              "Collateral token mint (SOL/wSOL for MVP)"
            ],
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "docs": [
              "Lending token mint (USDC)"
            ],
            "type": "pubkey"
          },
          {
            "name": "authority",
            "docs": [
              "Authority that created this market"
            ],
            "type": "pubkey"
          },
          {
            "name": "collateralRatioBps",
            "docs": [
              "Required collateral ratio in basis points (15000 = 150%)"
            ],
            "type": "u16"
          },
          {
            "name": "liquidationThresholdBps",
            "docs": [
              "Liquidation threshold in basis points (12000 = 120%)"
            ],
            "type": "u16"
          },
          {
            "name": "protocolFeeBps",
            "docs": [
              "Protocol fee in basis points on matched volume"
            ],
            "type": "u16"
          },
          {
            "name": "nextOrderId",
            "docs": [
              "Running counter for order IDs"
            ],
            "type": "u64"
          },
          {
            "name": "nextLoanId",
            "docs": [
              "Running counter for loan IDs"
            ],
            "type": "u64"
          },
          {
            "name": "activeLendOrders",
            "docs": [
              "Total number of active lend orders"
            ],
            "type": "u32"
          },
          {
            "name": "activeBorrowOrders",
            "docs": [
              "Total number of active borrow orders"
            ],
            "type": "u32"
          },
          {
            "name": "activeLoans",
            "docs": [
              "Total number of active loans"
            ],
            "type": "u32"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "orderStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "filled"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "priceFeedMessage",
      "repr": {
        "kind": "c"
      },
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "feedId",
            "docs": [
              "`FeedId` but avoid the type alias because of compatibility issues with Anchor's `idl-build` feature."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "price",
            "type": "i64"
          },
          {
            "name": "conf",
            "type": "u64"
          },
          {
            "name": "exponent",
            "type": "i32"
          },
          {
            "name": "publishTime",
            "docs": [
              "The timestamp of this price update in seconds"
            ],
            "type": "i64"
          },
          {
            "name": "prevPublishTime",
            "docs": [
              "The timestamp of the previous price update. This field is intended to allow users to",
              "identify the single unique price update for any moment in time:",
              "for any time t, the unique update is the one such that prev_publish_time < t <= publish_time.",
              "",
              "Note that there may not be such an update while we are migrating to the new message-sending logic,",
              "as some price updates on pythnet may not be sent to other chains (because the message-sending",
              "logic may not have triggered). We can solve this problem by making the message-sending mandatory",
              "(which we can do once publishers have migrated over).",
              "",
              "Additionally, this field may be equal to publish_time if the message is sent on a slot where",
              "where the aggregation was unsuccesful. This problem will go away once all publishers have",
              "migrated over to a recent version of pyth-agent."
            ],
            "type": "i64"
          },
          {
            "name": "emaPrice",
            "type": "i64"
          },
          {
            "name": "emaConf",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "priceUpdateV2",
      "docs": [
        "A price update account. This account is used by the Pyth Receiver program to store a verified price update from a Pyth price feed.",
        "It contains:",
        "- `write_authority`: The write authority for this account. This authority can close this account to reclaim rent or update the account to contain a different price update.",
        "- `verification_level`: The [`VerificationLevel`] of this price update. This represents how many Wormhole guardian signatures have been verified for this price update.",
        "- `price_message`: The actual price update.",
        "- `posted_slot`: The slot at which this price update was posted."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "writeAuthority",
            "type": "pubkey"
          },
          {
            "name": "verificationLevel",
            "type": {
              "defined": {
                "name": "verificationLevel"
              }
            }
          },
          {
            "name": "priceMessage",
            "type": {
              "defined": {
                "name": "priceFeedMessage"
              }
            }
          },
          {
            "name": "postedSlot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "verificationLevel",
      "docs": [
        "Pyth price updates are bridged to all blockchains via Wormhole.",
        "Using the price updates on another chain requires verifying the signatures of the Wormhole guardians.",
        "The usual process is to check the signatures for two thirds of the total number of guardians, but this can be cumbersome on Solana because of the transaction size limits,",
        "so we also allow for partial verification.",
        "",
        "This enum represents how much a price update has been verified:",
        "- If `Full`, we have verified the signatures for two thirds of the current guardians.",
        "- If `Partial`, only `num_signatures` guardian signatures have been checked.",
        "",
        "# Warning",
        "Using partially verified price updates is dangerous, as it lowers the threshold of guardians that need to collude to produce a malicious price update."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "partial",
            "fields": [
              {
                "name": "numSignatures",
                "type": "u8"
              }
            ]
          },
          {
            "name": "full"
          }
        ]
      }
    }
  ]
};
