// 常量配置
const GRID_SIZE = 4; // 格子数
const ANIMATION_DURATION = 180; // ms，动画时长

class Game2048 {
    constructor() {
        // 初始化数据结构
        this.grid = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(0));
        this.score = 0;
        this.bestScore = parseInt(localStorage.getItem('bestScore')) || 0;
        this.tileContainer = document.getElementById('tile-container');
        this.scoreDisplay = document.getElementById('score');
        this.bestScoreDisplay = document.getElementById('best-score');
        this.newGameButton = document.getElementById('new-game-button');
        this.undoButton = document.getElementById('undo-button');
        // 获取格子宽度和gap
        const cell = document.querySelector('.grid-cell');
        const cellRect = cell.getBoundingClientRect();
        this.cellSize = cellRect.width;
        const row = document.querySelector('.grid-row');
        const style = window.getComputedStyle(row);
        this.gap = parseInt(style.gap) || 0;
        this.tiles = {}; // 追踪每个tile的DOM，key为唯一id
        this.tileIds = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(null)); // 记录每个格子的tile唯一id
        this.nextTileId = 1; // 自增id
        this.history = []; // 用于撤销
        this.undoCount = 1; // 撤回次数
        this.mergedTiles = [];
        this.mergeEffects = [];
        this.hasWon = false; // 是否已弹出胜利提示
        this.rankKey = 'rankBoard'; // 本地排行榜key
        this.apiUrl = 'https://6825ddb6397e48c91313ed71.mockapi.io/scores'; // 全局排行榜API
        this.init();
    }

    init() {
        this.addRandomTile();
        this.addRandomTile();
        this.updateDisplay();
        this.updateTiles();
        
        document.addEventListener('keydown', this.handleKeyPress.bind(this));
        this.newGameButton.addEventListener('click', () => this.newGame());
        // 撤销按钮
        if (this.undoButton) {
            this.undoButton.addEventListener('click', () => this.undo());
            this.updateUndoButton();
        }
        // 胜利弹窗
        this.winModal = document.getElementById('win-modal');
        this.continueBtn = document.getElementById('continue-button');
        if (this.continueBtn) this.continueBtn.onclick = () => {
            this.hasWon = true;
            this.winModal.style.display = 'none';
        };
        // 游戏结束弹窗相关
        this.gameoverModal = document.getElementById('gameover-modal');
        this.submitBtn = document.getElementById('submit-score');
        this.playerNameInput = document.getElementById('player-name');
        this.submitTip = document.getElementById('submit-tip');
        if (this.submitBtn) {
            this.submitBtn.onclick = async () => {
                const name = this.playerNameInput.value.trim();
                if (!name) {
                    this.submitTip.textContent = '请输入名字';
                    this.submitTip.style.display = 'block';
                    return;
                }
                this.submitTip.style.display = 'none';
                this.submitBtn.disabled = true;
                this.submitBtn.textContent = '提交中...';
                try {
                    await this.submitScore(name, this.score);
                    this.gameoverModal.style.display = 'none';
                    this.updateRankBoard();
                } catch (e) {
                    this.submitTip.textContent = '提交失败，请重试';
                    this.submitTip.style.display = 'block';
                }
                this.submitBtn.disabled = false;
                this.submitBtn.textContent = '提交分数';
            };
        }
        // 触屏滑动支持
        this.addTouchSupport();
        this.skipBtn = document.getElementById('skip-score');
        if (this.skipBtn) {
            this.skipBtn.onclick = () => {
                this.gameoverModal.style.display = 'none';
                this.newGame();
            };
        }
    }

    addTouchSupport() {
        let startX = 0, startY = 0, endX = 0, endY = 0;
        const threshold = 30; // 最小滑动距离
        const gameContainer = document.querySelector('.game-container');
        if (!gameContainer) return;
        gameContainer.addEventListener('touchstart', e => {
            if (e.touches.length === 1) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                endX = startX;
                endY = startY;
            }
            e.preventDefault();
        }, {passive: false});
        gameContainer.addEventListener('touchmove', e => {
            if (e.touches.length === 1) {
                endX = e.touches[0].clientX;
                endY = e.touches[0].clientY;
            }
            e.preventDefault();
        }, {passive: false});
        gameContainer.addEventListener('touchend', e => {
            const dx = endX - startX;
            const dy = endY - startY;
            if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
            let key = '';
            if (Math.abs(dx) > Math.abs(dy)) {
                key = dx > 0 ? 'ArrowRight' : 'ArrowLeft';
            } else {
                key = dy > 0 ? 'ArrowDown' : 'ArrowUp';
            }
            this.handleKeyPress({key, preventDefault: () => {}});
            e.preventDefault();
        }, {passive: false});
    }

    newGame() {
        this.grid = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(0));
        this.score = 0;
        this.tileContainer.innerHTML = '';
        this.tiles = {};
        this.tileIds = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(null));
        this.nextTileId = 1;
        this.mergedTiles = [];
        this.mergeEffects = [];
        this.hasWon = false;
        this.history = [];
        this.undoCount = 1; // 重置撤回次数
        this.addRandomTile();
        this.addRandomTile();
        this.updateDisplay();
        this.updateTiles();
        this.updateRankBoard();
        this.updateUndoButton(); // 更新撤回按钮状态
        if (this.gameoverModal) this.gameoverModal.style.display = 'none';
    }

    addRandomTile() {
        const edgeCells = [];
        for (let i = 0; i < GRID_SIZE; i++) {
            for (let j = 0; j < GRID_SIZE; j++) {
                if (this.grid[i][j] === 0 && (i === 0 || i === GRID_SIZE - 1 || j === 0 || j === GRID_SIZE - 1)) {
                    edgeCells.push({x: i, y: j});
                }
            }
        }
        if (edgeCells.length > 0) {
            const randomCell = edgeCells[Math.floor(Math.random() * edgeCells.length)];
            const value = Math.random() < 0.9 ? 2 : 4;
            this.grid[randomCell.x][randomCell.y] = value;
            // 分配唯一id
            const id = this.nextTileId++;
            this.tileIds[randomCell.x][randomCell.y] = id;
            this.createTile(randomCell.x, randomCell.y, value, id, true);
        }
    }

    createTile(x, y, value, id, isNew = false) {
        let tile = document.createElement('div');
        tile.className = 'tile';
        tile.textContent = value;
        tile.setAttribute('data-value', value);
        tile.setAttribute('data-id', id);
        tile.style.left = (y * (this.cellSize + this.gap)) + 'px';
        tile.style.top = (x * (this.cellSize + this.gap)) + 'px';
        tile.style.width = this.cellSize + 'px';
        tile.style.height = this.cellSize + 'px';
        if (isNew) {
            tile.classList.add('new-tile');
            setTimeout(() => {
                tile.classList.remove('new-tile');
            }, 280); // 动画时长与CSS一致
        }
        this.tileContainer.appendChild(tile);
        this.tiles[id] = tile;
    }

    updateTiles() {
        // 只移动/更新发生变化的tile
        const usedIds = new Set();
        // 记录需要延迟更新的目标tile
        const delayedMerge = [];
        for (let i = 0; i < GRID_SIZE; i++) {
            for (let j = 0; j < GRID_SIZE; j++) {
                const id = this.tileIds[i][j];
                if (this.grid[i][j] !== 0 && id) {
                    usedIds.add(id);
                    const tile = this.tiles[id];
                    if (!tile) continue; // 跳过不存在的tile
                    
                    // 计算新位置
                    const left = (j * (this.cellSize + this.gap)) + 'px';
                    const top = (i * (this.cellSize + this.gap)) + 'px';
                    
                    // 使用transform来实现更流畅的动画
                    const oldLeft = tile.style.left;
                    const oldTop = tile.style.top;
                    
                    // 只在位置变化时才更新
                    if (oldLeft !== left || oldTop !== top) {
                        // 添加过渡动画
                        tile.style.transition = `top ${ANIMATION_DURATION}ms ease, left ${ANIMATION_DURATION}ms ease`;
                        tile.style.left = left;
                        tile.style.top = top;
                    }
                    
                    // 合并动画延迟处理
                    if (this.mergedTiles && this.mergedTiles.some(pos => pos.x === i && pos.y === j)) {
                        // 记录需要延迟更新的目标tile
                        delayedMerge.push({tile, value: this.grid[i][j]});
                    } else {
                        // 非合并目标，立即更新数字
                        if (tile.textContent != this.grid[i][j]) {
                            tile.textContent = this.grid[i][j];
                            tile.setAttribute('data-value', this.grid[i][j]);
                        }
                    }
                }
            }
        }
        
        // 处理被合并tile的滑动和延迟移除
        if (this.mergeEffects && this.mergeEffects.length > 0) {
            for (const effect of this.mergeEffects) {
                const tile = this.tiles[effect.from.id];
                if (tile) {
                    // 将被合并的tile移动到目标位置
                    const left = (effect.to.y * (this.cellSize + this.gap)) + 'px';
                    const top = (effect.to.x * (this.cellSize + this.gap)) + 'px';
                    
                    // 添加过渡动画
                    tile.style.transition = `top ${ANIMATION_DURATION}ms ease, left ${ANIMATION_DURATION}ms ease, opacity ${ANIMATION_DURATION/2}ms ease`;
                    tile.style.left = left;
                    tile.style.top = top;
                    tile.style.zIndex = 4;
                    
                    // 动画完成后淡出并移除
                    setTimeout(() => {
                        tile.style.opacity = 0;
                        tile.addEventListener('transitionend', function handler(e) {
                            if (e.propertyName === 'opacity' && tile.parentNode) {
                                tile.parentNode.removeChild(tile);
                                delete this.tiles[effect.from.id];
                                tile.removeEventListener('transitionend', handler);
                            }
                        }.bind(this));
                    }, ANIMATION_DURATION); // 等滑动动画结束后再淡出
                }
            }
        }
        
        // 延迟更新目标tile的数字和动画
        setTimeout(() => {
            for (const {tile, value} of delayedMerge) {
                // 确保tile仍然存在
                if (!tile || !tile.parentNode) continue;
                
                // 更新数字
                tile.textContent = value;
                tile.setAttribute('data-value', value);
                
                // 添加合并动画效果
                tile.classList.add('merge-animate');
                
                // 动画结束后移除动画类
                tile.addEventListener('animationend', function handler() {
                    tile.classList.remove('merge-animate');
                    tile.removeEventListener('animationend', handler);
                });
            }
        }, ANIMATION_DURATION + 10); // 等被合并tile淡出后再更新
        
        // 移除消失的tile
        for (const id in this.tiles) {
            if (!usedIds.has(Number(id))) {
                // 如果已经在mergeEffects里处理过就不再移除
                if (this.mergeEffects && this.mergeEffects.some(e => e.from.id == id)) continue;
                
                // 添加淡出效果
                const tile = this.tiles[id];
                if (tile && tile.parentNode) {
                    tile.style.transition = `opacity ${ANIMATION_DURATION/2}ms ease`;
                    tile.style.opacity = 0;
                    
                    // 动画结束后移除元素
                    tile.addEventListener('transitionend', function handler(e) {
                        if (e.propertyName === 'opacity' && tile.parentNode) {
                            tile.parentNode.removeChild(tile);
                            delete this.tiles[id];
                            tile.removeEventListener('transitionend', handler);
                        }
                    }.bind(this));
                } else {
                    // 如果没有父节点，直接删除引用
                    delete this.tiles[id];
                }
            }
        }
    }

    updateDisplay() {
        this.scoreDisplay.textContent = this.score;
        this.bestScoreDisplay.textContent = this.bestScore;
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            localStorage.setItem('bestScore', this.bestScore);
        }
        this.updateRankBoard();
    }

    async updateRankBoard() {
        // 拉取全局排行榜
        try {
            const res = await fetch(this.apiUrl + '?sortBy=score&order=desc&limit=5');
            const rank = await res.json();
            const rankList = document.getElementById('rank-list');
            if (rankList) {
                rankList.innerHTML = '';
                // 只显示前五名
                rank.slice(0, 5).forEach((item, index) => {
                    const li = document.createElement('li');
                    li.textContent = `${item.name || '匿名'} - ${item.score}`;
                    rankList.appendChild(li);
                });
            }
        } catch (e) {
            // 网络异常时不更新
        }
    }

    async submitScore(name, score) {
        await fetch(this.apiUrl, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name, score, createdAt: new Date().toISOString()})
        });
    }

    handleKeyPress(event) {
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const oldGrid = JSON.stringify(this.grid);
        const oldTileIds = this.tileIds.map(row => row.slice());
        let moved = false;
        // 在移动前保存历史记录
        this.saveHistory();
        switch(event.key) {
            case 'ArrowLeft': moved = this.moveLeft(); break;
            case 'ArrowRight': moved = this.moveRight(); break;
            case 'ArrowUp': moved = this.moveUp(); break;
            case 'ArrowDown': moved = this.moveDown(); break;
        }
        if (oldGrid !== JSON.stringify(this.grid) || moved) {
            this.updateTiles();
            this.addRandomTile();
            this.updateDisplay();
            this.checkWin();
            this.isGameOver(); // 只弹自定义弹窗，不再alert
        }
    }

    moveLeft() {
        let moved = false;
        this.mergedTiles = [];
        this.mergeEffects = [];
        for (let i = 0; i < GRID_SIZE; i++) {
            // 筛选出非零单元格及其ID
            let row = this.grid[i].filter(cell => cell !== 0);
            let ids = this.tileIds[i].filter((id, idx) => this.grid[i][idx] !== 0);
            
            // 记录原始位置，用于追踪移动
            let originalPositions = [];
            for (let j = 0; j < GRID_SIZE; j++) {
                if (this.grid[i][j] !== 0) {
                    originalPositions.push({value: this.grid[i][j], id: this.tileIds[i][j], pos: j});
                }
            }
            
            // 合并相同数字
            for (let j = 0; j < row.length - 1; j++) {
                if (row[j] === row[j + 1]) {
                    row[j] *= 2;
                    this.score += row[j];
                    
                    // 记录要被合并的tile的原始位置
                    const sourcePos = originalPositions[j + 1].pos;
                    const targetPos = j; // 合并后的位置
                    
                    this.mergeEffects.push({
                        from: {x: i, y: sourcePos, id: ids[j + 1]},
                        to: {x: i, y: targetPos, id: ids[j]}
                    });
                    
                    row.splice(j + 1, 1);
                    ids.splice(j + 1, 1);
                    originalPositions.splice(j + 1, 1);
                    this.mergedTiles.push({x: i, y: j});
                }
            }
            
            // 填充剩余空间
            while (row.length < GRID_SIZE) row.push(0);
            while (ids.length < GRID_SIZE) ids.push(null);
            
            // 检查是否发生移动
            if (JSON.stringify(this.grid[i]) !== JSON.stringify(row)) moved = true;
            this.grid[i] = row;
            this.tileIds[i] = ids;
        }
        return moved;
    }

    moveRight() {
        let moved = false;
        this.mergedTiles = [];
        this.mergeEffects = [];
        for (let i = 0; i < GRID_SIZE; i++) {
            // 筛选出非零单元格及其ID
            let row = this.grid[i].filter(cell => cell !== 0);
            let ids = this.tileIds[i].filter((id, idx) => this.grid[i][idx] !== 0);
            
            // 记录原始位置，用于追踪移动
            let originalPositions = [];
            for (let j = 0; j < GRID_SIZE; j++) {
                if (this.grid[i][j] !== 0) {
                    originalPositions.push({value: this.grid[i][j], id: this.tileIds[i][j], pos: j});
                }
            }
            
            // 合并相同数字（从右向左）
            for (let j = row.length - 1; j > 0; j--) {
                if (row[j] === row[j - 1]) {
                    row[j] *= 2;
                    this.score += row[j];
                    
                    // 记录要被合并的tile的原始位置
                    const sourcePos = originalPositions[j - 1].pos;
                    // 计算合并后的新位置（在右侧）
                    const targetPos = GRID_SIZE - (row.length - j);
                    
                    this.mergeEffects.push({
                        from: {x: i, y: sourcePos, id: ids[j - 1]},
                        to: {x: i, y: targetPos, id: ids[j]}
                    });
                    
                    row.splice(j - 1, 1);
                    ids.splice(j - 1, 1);
                    originalPositions.splice(j - 1, 1);
                    this.mergedTiles.push({x: i, y: targetPos});
                    j--; // 跳过已合并的元素
                }
            }
            
            // 填充左侧空白
            while (row.length < GRID_SIZE) row.unshift(0);
            while (ids.length < GRID_SIZE) ids.unshift(null);
            
            // 检查是否发生移动
            if (JSON.stringify(this.grid[i]) !== JSON.stringify(row)) moved = true;
            this.grid[i] = row;
            this.tileIds[i] = ids;
        }
        return moved;
    }

    moveUp() {
        let moved = false;
        this.mergedTiles = [];
        this.mergeEffects = [];
        for (let j = 0; j < GRID_SIZE; j++) {
            let column = [], ids = [];
            
            // 记录原始位置，用于追踪移动
            let originalPositions = [];
            for (let i = 0; i < GRID_SIZE; i++) {
                if (this.grid[i][j] !== 0) {
                    column.push(this.grid[i][j]);
                    ids.push(this.tileIds[i][j]);
                    originalPositions.push({value: this.grid[i][j], id: this.tileIds[i][j], pos: i});
                }
            }
            
            // 合并相同数字（从上到下）
            for (let i = 0; i < column.length - 1; i++) {
                if (column[i] === column[i + 1]) {
                    column[i] *= 2;
                    this.score += column[i];
                    
                    // 记录要被合并的tile的原始位置
                    const sourcePos = originalPositions[i + 1].pos;
                    const targetPos = i; // 合并后的位置
                    
                    this.mergeEffects.push({
                        from: {x: sourcePos, y: j, id: ids[i + 1]},
                        to: {x: targetPos, y: j, id: ids[i]}
                    });
                    
                    column.splice(i + 1, 1);
                    ids.splice(i + 1, 1);
                    originalPositions.splice(i + 1, 1);
                    this.mergedTiles.push({x: i, y: j});
                }
            }
            
            // 填充剩余空间
            while (column.length < GRID_SIZE) column.push(0);
            while (ids.length < GRID_SIZE) ids.push(null);
            
            // 更新网格
            for (let i = 0; i < GRID_SIZE; i++) {
                if (this.grid[i][j] !== column[i]) moved = true;
                this.grid[i][j] = column[i];
                this.tileIds[i][j] = ids[i];
            }
        }
        return moved;
    }

    moveDown() {
        let moved = false;
        this.mergedTiles = [];
        this.mergeEffects = [];
        for (let j = 0; j < GRID_SIZE; j++) {
            let column = [], ids = [];
            
            // 记录原始位置，用于追踪移动
            let originalPositions = [];
            for (let i = 0; i < GRID_SIZE; i++) {
                if (this.grid[i][j] !== 0) {
                    column.push(this.grid[i][j]);
                    ids.push(this.tileIds[i][j]);
                    originalPositions.push({value: this.grid[i][j], id: this.tileIds[i][j], pos: i});
                }
            }
            
            // 合并相同数字（从下到上）
            for (let i = column.length - 1; i > 0; i--) {
                if (column[i] === column[i - 1]) {
                    column[i] *= 2;
                    this.score += column[i];
                    
                    // 记录要被合并的tile的原始位置
                    const sourcePos = originalPositions[i - 1].pos;
                    // 计算合并后的新位置（在底部）
                    const targetPos = GRID_SIZE - (column.length - i);
                    
                    this.mergeEffects.push({
                        from: {x: sourcePos, y: j, id: ids[i - 1]},
                        to: {x: targetPos, y: j, id: ids[i]}
                    });
                    
                    column.splice(i - 1, 1);
                    ids.splice(i - 1, 1);
                    originalPositions.splice(i - 1, 1);
                    this.mergedTiles.push({x: targetPos, y: j});
                    i--; // 跳过已合并的元素
                }
            }
            
            // 填充顶部空白
            while (column.length < GRID_SIZE) column.unshift(0);
            while (ids.length < GRID_SIZE) ids.unshift(null);
            
            // 更新网格
            for (let i = 0; i < GRID_SIZE; i++) {
                if (this.grid[i][j] !== column[i]) moved = true;
                this.grid[i][j] = column[i];
                this.tileIds[i][j] = ids[i];
            }
        }
        return moved;
    }

    isGameOver() {
        // 检查是否有空格
        for (let i = 0; i < GRID_SIZE; i++) {
            for (let j = 0; j < GRID_SIZE; j++) {
                if (this.grid[i][j] === 0) return false;
            }
        }
        
        // 检查是否有相邻的相同数字
        for (let i = 0; i < GRID_SIZE; i++) {
            for (let j = 0; j < GRID_SIZE; j++) {
                if (j < GRID_SIZE - 1 && this.grid[i][j] === this.grid[i][j + 1]) return false;
                if (i < GRID_SIZE - 1 && this.grid[i][j] === this.grid[i + 1][j]) return false;
            }
        }
        
        // 游戏结束，弹窗输入名字
        setTimeout(() => {
            if (this.gameoverModal) {
                this.playerNameInput.value = '';
                this.submitTip.style.display = 'none';
                this.gameoverModal.style.display = 'flex';
            }
        }, 300);
        return true;
    }

    checkWin() {
        if (this.hasWon) return;
        for (let i = 0; i < GRID_SIZE; i++) {
            for (let j = 0; j < GRID_SIZE; j++) {
                if (this.grid[i][j] === 2048) {
                    this.winModal.style.display = 'flex';
                    this.hasWon = true;
                    return;
                }
            }
        }
    }

    saveHistory() {
        // 最多保存20步
        if (this.history.length > 20) this.history.shift();
        this.history.push({
            grid: this.grid.map(row => row.slice()),
            tileIds: this.tileIds.map(row => row.slice()),
            score: this.score,
            bestScore: this.bestScore,
            nextTileId: this.nextTileId
        });
    }

    updateUndoButton() {
        if (!this.undoButton) return;
        this.undoButton.textContent = `撤销 (${this.undoCount})`;
        this.undoButton.disabled = this.undoCount === 0;
        if (this.undoCount === 0) {
            this.undoButton.style.opacity = '0.5';
            this.undoButton.style.cursor = 'not-allowed';
        } else {
            this.undoButton.style.opacity = '1';
            this.undoButton.style.cursor = 'pointer';
        }
    }

    undo() {
        if (!this.history.length || this.undoCount === 0) return;
        const last = this.history.pop();
        this.grid = last.grid.map(row => row.slice());
        this.tileIds = last.tileIds.map(row => row.slice());
        this.score = last.score;
        this.bestScore = last.bestScore;
        this.nextTileId = last.nextTileId;
        this.hasWon = false;
        
        // 清空并重建所有tile
        this.tileContainer.innerHTML = '';
        this.tiles = {};
        for (let i = 0; i < GRID_SIZE; i++) {
            for (let j = 0; j < GRID_SIZE; j++) {
                if (this.grid[i][j] !== 0) {
                    this.createTile(i, j, this.grid[i][j], this.tileIds[i][j]);
                }
            }
        }
        
        this.undoCount = 0; // 使用撤回次数
        this.updateUndoButton(); // 更新按钮状态
        this.updateDisplay();
    }
}

// 启动游戏
new Game2048(); 